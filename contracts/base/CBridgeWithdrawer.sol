// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "./OperatorBase.sol";

interface IWithdrawBox {
    function withdraw(
        uint64 _wdSeq,
        address _receiver,
        uint64 _toChain,
        uint64[] calldata _fromChains,
        address[] calldata _tokens,
        uint32[] calldata _ratios,
        uint32[] calldata _slippages
    ) external;
}

abstract contract CBridgeWithdrawer is OperatorBase {
    IWithdrawBox public withdrawBox;
    uint64 public withdrawNonce;

    function __CBridgeWithdrawer_init(
        IERC20Upgradeable _usx,
        IWithdrawBox _withdrawBox
    ) internal {
        __OperatorBase_init(_usx);
        __CBridgeWithdrawer_init_unchained(_withdrawBox);
    }

    function __CBridgeWithdrawer_init_unchained(IWithdrawBox _withdrawBox)
        internal
    {
        require(
            address(_withdrawBox) != address(0),
            "withdrawBox can not be zero address"
        );
        withdrawBox = _withdrawBox;

        withdrawNonce = uint64(_getChainId()) << 32;
    }

    function _getChainId() internal pure returns (uint256) {
        uint256 chainId;
        assembly {
            chainId := chainid()
        }
        return chainId;
    }

    function requestWithdrawFromCBridge(
        address _receiver,
        uint64 _toChain,
        uint64[] calldata _fromChains,
        address[] calldata _tokens,
        uint32[] calldata _ratios,
        uint32[] calldata _slippages
    ) external nonReentrant onlyWhitelist(msg.sender) {
        withdrawBox.withdraw(
            withdrawNonce,
            _receiver,
            _toChain,
            _fromChains,
            _tokens,
            _ratios,
            _slippages
        );

        // Should not overflow
        withdrawNonce = withdrawNonce + 1;
    }
}
