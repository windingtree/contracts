/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { task } from "hardhat/config";
import { utils, Wallet } from "ethers";
import { randomId, createSupplierId } from "../utils";

task("debug", "Transaction debug")
  .addParam("tx", "Transaction hash")
  .setAction(async (args, hre) => {
    const txHash = args.tx;
    const trace = await hre.network.provider.send(
      "debug_traceTransaction", // debug_traceTransaction
      [
        txHash,
        // {
        //   disableMemory: true,
        //   disableStack: true,
        //   disableStorage: true,
        // },
      ]
    );
    console.log(JSON.stringify(trace, null, 2));
  });

task("wallet", "Generate random wallet").setAction(async () => {
  const mnemonic = utils.entropyToMnemonic(utils.randomBytes(32));
  console.log(`Mnemonic: ${mnemonic}`);
  const wallet = Wallet.fromMnemonic(mnemonic);
  console.log("Account address:", wallet.address);
  console.log("PK:", wallet.privateKey);
});

task("entity").setAction(async () => {
  const ownerMnemonic = utils.entropyToMnemonic(utils.randomBytes(32));
  console.log(`Owner mnemonic: ${ownerMnemonic}`);
  const ownerWallet = Wallet.fromMnemonic(ownerMnemonic);
  console.log("Owner account address:", ownerWallet.address);
  console.log("Owner PK:", ownerWallet.privateKey, "\n");

  const signerMnemonic = utils.entropyToMnemonic(utils.randomBytes(32));
  console.log(`Signer mnemonic: ${signerMnemonic}`);
  const signerWallet = Wallet.fromMnemonic(signerMnemonic);
  console.log("Signer account address:", signerWallet.address);
  console.log("Signer PK:", signerWallet.privateKey, "\n");

  const salt = randomId();
  console.log(`Entity Id salt: ${salt}`);
  console.log(`Entity Id:`, createSupplierId(ownerWallet.address, salt));
});

task("encodeBytes32String")
  .addParam("string", "String to encode")
  .setAction(async (args) => {
    console.log("String:", args.string);
    console.log(
      "Bytes32String:",
      utils.formatBytes32String(args.string as string)
    );
  });
