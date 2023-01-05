// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "./base/OperatorBase.sol";
import "./base/FVLiquidityOperator.sol";
import "./base/L2Operator.sol";
import "./base/CBridgeWithdrawer.sol";

contract ArbiOperator is
    OperatorBase,
    FVLiquidityOperator,
    L2Operator,
    CBridgeWithdrawer
{
    constructor(
        IERC20Upgradeable _usx,
        IFlashVault _flashVault,
        address _cBridge,
        address _l2Bridge,
        IWithdrawBox _withdrawBox
    ) public {
        initialize(_usx, _flashVault, _cBridge, _l2Bridge, _withdrawBox);
    }

    function initialize(
        IERC20Upgradeable _usx,
        IFlashVault _flashVault,
        address _cBridge,
        address _l2Bridge,
        IWithdrawBox _withdrawBox
    ) public initializer {
        __OperatorBase_init(_usx);
        __FVLiquidityOperator_init_unchained(_flashVault);
        __L2Operator_init_unchained(_cBridge, _l2Bridge);
        __CBridgeWithdrawer_init_unchained(_withdrawBox);
    }

    /**
     * @dev Override the storages as the layout has been redesigned.
     *  Keep the owner and white list untouched
     */
    function upgrade(IWithdrawBox _withdrawBox) external onlyOwner {
        __CBridgeWithdrawer_init_unchained(_withdrawBox);
    }

    /**
     * @dev Deposit USX that transfered by the corss-chain bridge to the Vault Token contract
     *      or the cBridge contract.
     * @param _data Encode data that contains operator contract address and the action that
     *              encode with the function selector.
     */
    function executeStrategy(bytes memory _data)
        external
        override
        nonReentrant
    {
        require(
            msg.sender == L2Bridge,
            "executeStrategy: Only for arbitrum bridge!"
        );
        (, bytes memory _dataWithSignature) = abi.decode(
            _data,
            (address, bytes)
        );

        (bool _success, ) = address(this).call(_dataWithSignature);
        _success;
    }

    /**
     * @dev Deposit USX to the Vault Token contract.
     */
    function mint(uint256 _amount) external override {
        require(
            msg.sender == address(this) || whitelists[msg.sender],
            "mint: Only for whitelist user and operator contract self!"
        );
        flashVault.mint(address(this), _amount);
    }
}
