/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { task } from 'hardhat/config';

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
    console.log('@@@', JSON.stringify(trace, null, 2));
  });
