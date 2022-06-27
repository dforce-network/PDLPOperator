// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "./OperatorBase.sol";

interface IcBridge {
    function addLiquidity(address _token, uint256 _amount) external;

    function withdraw(
        bytes calldata _wdmsg,
        bytes[] calldata _sigs,
        address[] calldata _signers,
        uint256[] calldata _powers
    ) external;
}

abstract contract L2Operator is OperatorBase {
    IcBridge public cBridge;
    address public L2Bridge;

    function __L2Operator_init(
        IERC20Upgradeable _usx,
        address _cBridge,
        address _L2Bridge
    ) internal {
        __OperatorBase_init(_usx);
        __L2Operator_init_unchained(_cBridge, _L2Bridge);
    }

    function __L2Operator_init_unchained(address _cBridge, address _L2Bridge)
        internal
    {
        require(
            _cBridge != address(0),
            "initialize: cBridge contract can not be the zero address!"
        );
        require(
            _L2Bridge != address(0),
            "initialize: L2 bridge contract can not be the zero address!"
        );

        cBridge = IcBridge(_cBridge);
        L2Bridge = _L2Bridge;

        // approve underlying to cBridge
        USX.approve(address(cBridge), uint256(-1));
    }

    /**
     * @dev Deposit USX that transfered by the corss-chain bridge to the Vault Token contract
     *      or the cBridge contract.
     * @param _data Encode data to execute.
     */
    function executeStrategy(bytes memory _data) external virtual {}

    /**
     * @dev Deposit USX.
     */
    function mint(uint256 _amount) external virtual {}

    /**
     * @dev Add liquidity of USX to the cBridge contract.
     */
    function addLiquidity(uint256 _amount) external {
        require(
            msg.sender == address(this) || whitelists[msg.sender],
            "addLiquidity: Only for whitelist user and operator contract self!"
        );
        cBridge.addLiquidity(address(USX), _amount);
    }

    /**
     * @dev Finalize the withdraw request to the celer bridge pool
     * can be called by anyone as request is submmitted by whitelist user
     */
    function withdrawFromCBridge(
        bytes calldata _wdmsg,
        bytes[] calldata _sigs,
        address[] calldata _signers,
        uint256[] calldata _powers
    ) external nonReentrant {
        cBridge.withdraw(_wdmsg, _sigs, _signers, _powers);
    }
}
