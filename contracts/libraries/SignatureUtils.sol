// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

library SignatureUtils {
  error InvalidSignature();

  /// @dev Splits signature into v/r/s form
  function split(
    bytes memory signature
  ) internal pure returns (uint8 v, bytes32 r, bytes32 s) {
    if (signature.length == 65) {
      assembly {
        r := mload(add(signature, 0x20))
        s := mload(add(signature, 0x40))
        v := byte(0, mload(add(signature, 0x60)))

        if eq(v, 0) {
          v := 27
        }

        if eq(v, 1) {
          v := 28
        }
      }
    } else {
      revert InvalidSignature();
    }
  }
}
