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

    function requestWithdrawFromCBridge(uint32 _ratio)
        external
        nonReentrant
        onlyWhitelist(msg.sender)
    {
        uint64[] memory _fromChains = new uint64[](1);
        address[] memory _tokens = new address[](1);
        uint32[] memory _ratios = new uint32[](1);
        uint32[] memory _slippages = new uint32[](1);

        uint64 _chainId = uint64(_getChainId());

        _fromChains[0] = _chainId;
        _tokens[0] = address(USX);
        _ratios[0] = _ratio;
        _slippages[0] = 100;

        withdrawBox.withdraw(
            withdrawNonce,
            address(this),
            _chainId,
            _fromChains,
            _tokens,
            _ratios,
            _slippages
        );

        // Should not overflow
        withdrawNonce = withdrawNonce + 1;
    }
}
