// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "./base/OperatorBase.sol";
import "./base/FVLiquidityOperator.sol";
import "./base/L2Operator.sol";

contract ArbiOperator is OperatorBase, FVLiquidityOperator, L2Operator {
    constructor(
        IERC20Upgradeable _usx,
        IFlashVault _flashVault,
        address _cBridge,
        address _l2Bridge
    ) public {
        initialize(_usx, _flashVault, _cBridge, _l2Bridge);
    }

    function initialize(
        IERC20Upgradeable _usx,
        IFlashVault _flashVault,
        address _cBridge,
        address _l2Bridge
    ) public initializer {
        __OperatorBase_init(_usx);
        __FVLiquidityOperator_init_unchained(_flashVault);
        __L2Operator_init_unchained(_cBridge, _l2Bridge);
    }

    /**
     * @dev Override the storages as the layout has been redesigned.
     *  Keep the owner and white list untouched
     */
    function upgrade(
        IERC20Upgradeable _usx,
        IFlashVault _flashVault,
        address _cBridge,
        address _l2Bridge
    ) external onlyOwner {
        __OperatorBase_init_unchained(_usx);
        __FVLiquidityOperator_init_unchained(_flashVault);
        __L2Operator_init_unchained(_cBridge, _l2Bridge);
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
            msg.sender == address(this),
            "mint: Only for operator contract self!"
        );
        flashVault.mint(address(this), _amount);
    }

    /**
     * @dev Add liquidity of USX to the cBridge contract.
     */
    function addLiquidity(uint256 _amount) external override {
        require(
            msg.sender == address(this),
            "mint: Only for operator contract self!"
        );
        cBridge.addLiquidity(address(USX), _amount);
    }
}
