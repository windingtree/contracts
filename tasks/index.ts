/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { task } from 'hardhat/config';
import { utils, Wallet } from 'ethers';

task('debug', 'Transaction debug')
  .addParam('tx', 'Transaction hash')
  .setAction(async (args, hre) => {
    const txHash = args.tx;
    const trace = await hre.network.provider.send(
      'eth_getTransactionReceipt', // debug_traceTransaction
      [
        txHash,
        // {
        //   disableMemory: true,
        //   disableStack: true,
        //   disableStorage: true,
        // },
      ],
    );
    console.log(JSON.stringify(trace, null, 2));
  });

task('wallet', 'Generate random wallet')
  // eslint-disable-next-line @typescript-eslint/require-await
  .setAction(async () => {
    const mnemonic = utils.entropyToMnemonic(utils.randomBytes(32));
    console.log(`Mnemonic: ${mnemonic}`);
    const wallet = Wallet.fromMnemonic(mnemonic);
    console.log('Account address:', wallet.address);
    console.log('PK:', wallet.privateKey);
  });
