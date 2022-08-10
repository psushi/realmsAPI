import { getKeypair } from "../../utils/general";
import { NextApiRequest, NextApiResponse } from "next";

import {
  withCreateProposal,
  getGovernanceProgramVersion,
  TokenOwnerRecord,
  getGovernanceAccounts,
  pubkeyFilter,
  VoteType,
  CreateProposalArgs,
  withInsertTransaction,
  getGovernance,
  withAddSignatory,
  withExecuteTransaction,
  withSignOffProposal,
  getSignatoryRecordAddress,
  serializeInstructionToBase64,
  InstructionData,
  createInstructionData,
} from "@solana/spl-governance";
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

import {
  createAssociatedTokenAccount,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  getAccount,
  mintTo,
} from "@solana/spl-token";
import { getDevnetConnection } from "../../utils/general";

const TEST_PROGRAM_ID = new PublicKey(
  "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw"
);

// const MULTISIG_REALM = new PublicKey(
//   "LqtG6VnoH8tGgaQYQwdeTShUXNhbc4T52kBwUhCsQuS"
// );

// const COUNCIL_MINT = new PublicKey(
//   "AwyizDJkwRutTsViseeZHP1y34jKBcqgpzRGW3Ued6B8"
// );

// const COUNCIL_MINT_GOVERNANCE = new PublicKey(
//   "4irjHXNaJkSQuDK9KqwfTmjUcBXDswpXf8iSxuR6NtmT"
// );

// const DAO_WALLET = new PublicKey("jNKZfvi5oHpLKAC5PFWHmTBkmor9td4EC5AXhjQE9SG");
const MULTISIG_REALM = new PublicKey(
  "Bcu1boQ1RBxRPQvAdQtyacGFmJ76Yq9iu1MkW6JnwuS4"
);

const COUNCIL_MINT = new PublicKey(
  "2Gc6KVGvJT8g3chxWLMCgdqNEt4Z1gdfNkZTQp5dRpoo"
);

const COUNCIL_MINT_GOVERNANCE = new PublicKey(
  "2mXqwYpN4fRPopEjyow8RRvQFMD7QwWTW3pxvZwjgaR6"
);

const DAO_WALLET = new PublicKey(
  "2rAaREc7BE753sXUW6bd9vbn1NsLEz8VZraZTTv4WeeB"
);
const TEST_MINT = new PublicKey("EcJxapPGbiWgsQ2f4EiZiw6uekDUcbVo5qctvvLwZ82n");

const dave = new PublicKey("4rpZQJHMz5UNWQEutZcLJi7hGaZgV3vnFoS1EqZFJRi2");

const connection = getDevnetConnection();
const mintTokenTo = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const LHT = getKeypair();
    const programVersion = await getGovernanceProgramVersion(
      connection,
      TEST_PROGRAM_ID
    );

    console.log("programVersion", programVersion);

    const tokenOwnerRecord = await getGovernanceAccounts(
      connection,
      TEST_PROGRAM_ID,
      TokenOwnerRecord,
      [pubkeyFilter(1, MULTISIG_REALM)!, pubkeyFilter(65, LHT.publicKey)!]
    );

    const governance = await getGovernance(connection, COUNCIL_MINT_GOVERNANCE);

    const proposalInstructions: TransactionInstruction[] = [];

    const proposalAddress = await withCreateProposal(
      proposalInstructions,
      TEST_PROGRAM_ID,
      2,
      MULTISIG_REALM,
      COUNCIL_MINT_GOVERNANCE,
      tokenOwnerRecord[0]!.pubkey,
      "Mint to proposal - " + governance.account.proposalCount,
      "This mint 1 token to LHT",
      COUNCIL_MINT,
      LHT.publicKey,
      governance.account.proposalCount,
      VoteType.SINGLE_CHOICE,
      ["Approve"],
      true,
      LHT.publicKey
    );

    let associatedTokenAccount = await getAssociatedTokenAddress(
      TEST_MINT,
      LHT.publicKey
    );

    console.log(associatedTokenAccount);

    const insertInstructions: TransactionInstruction[] = [];

    try {
      const info = await getAccount(connection, associatedTokenAccount);
      console.log(info);
    } catch (e) {
      insertInstructions.push(
        createAssociatedTokenAccountInstruction(
          DAO_WALLET,
          associatedTokenAccount,
          LHT.publicKey,
          TEST_MINT
        )
      );
    }

    insertInstructions.push(
      createMintToInstruction(
        TEST_MINT,
        associatedTokenAccount,
        COUNCIL_MINT_GOVERNANCE,
        LAMPORTS_PER_SOL * 1
      )
    );

    console.log("insertInstructions", insertInstructions);

    // const instructionData = createInstructionData(mintInstruction);

    for (let ins of insertInstructions) {
      const instructionData = createInstructionData(ins);
      console.log("instruction data", instructionData);

      await withInsertTransaction(
        proposalInstructions,
        TEST_PROGRAM_ID,
        2,
        COUNCIL_MINT_GOVERNANCE,
        proposalAddress,
        tokenOwnerRecord[0]!.pubkey,
        LHT.publicKey,
        insertInstructions.indexOf(ins),
        0,
        0,
        [instructionData],
        LHT.publicKey
      );
    }

    const signRecord = await withAddSignatory(
      proposalInstructions,
      TEST_PROGRAM_ID,
      programVersion,
      proposalAddress,
      tokenOwnerRecord[0]!.pubkey,
      LHT.publicKey,
      LHT.publicKey,
      LHT.publicKey
    );

    const signatoryRecord = await getSignatoryRecordAddress(
      TEST_PROGRAM_ID,
      proposalAddress,
      LHT.publicKey
    );
    // console.log("signatoryRecord", signatoryRecord);

    withSignOffProposal(
      proposalInstructions,
      TEST_PROGRAM_ID,
      2,
      MULTISIG_REALM,
      COUNCIL_MINT_GOVERNANCE,
      proposalAddress,
      LHT.publicKey,
      signatoryRecord,
      undefined
    );

    const txn = new Transaction().add(...proposalInstructions);
    console.log(txn);

    const sig = await sendAndConfirmTransaction(connection, txn, [LHT]);
    console.log(sig);

    //   const sig = "";
    return res.json({
      succes: true,
    });
  } catch (e) {
    console.log(e);
    return res.json({
      succes: false,
    });
  }
};

export default mintTokenTo;