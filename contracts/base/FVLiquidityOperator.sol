// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts-upgradeable/utils/EnumerableSetUpgradeable.sol";

import "./VaultBase.sol";
import "./LiquidityOperator.sol";

interface IvToken {
    function isiToken() external returns (bool);

    function underlying() external returns (address);

    function mint(address _to, uint256 _amount) external;

    function balanceOf(address _account) external returns (uint256);

    function repayBorrow(uint256 _repayAmount) external;

    function flashBorrow(uint256 _borrowAmount) external;
}

interface IviToken {
    function isiToken() external returns (bool);

    function underlying() external returns (address);

    function controller() external returns (address);

    function mint(address _to, uint256 _amount) external;

    function flashRedeemUnderlying(uint256 _redeemUnderlying) external;
}

interface IControllerFlashVault {
    function enterMarkets(address[] calldata _iTokens)
        external
        returns (bool[] memory _results);
}

abstract contract FVLiquidityOperator is OperatorBase, LiquidityOperator {
    IvToken public flashVault;

    IControllerFlashVault public controller;

    uint8 internal currentProvider;

    struct CollateralInfo {
        address collateral;
        address vCollateral;
    }

    mapping(address => CollateralInfo) public collateralInfo;

    function __FVLiquidityOperator_init(
        IERC20Upgradeable _usx,
        IvToken _flashVault,
        IControllerFlashVault _controller
    ) internal {
        __OperatorBase_init(_usx);
        __LiquidityOperator_init_unchained();
        __FVLiquidityOperator_init_unchained(_flashVault, _controller);
    }

    function __FVLiquidityOperator_init_unchained(
        IvToken _flashVault,
        IControllerFlashVault _controller
    ) internal {
        flashVault = _flashVault;
        controller = _controller;
    }

    function _addProvider(address) public virtual override {
        revert(
            "FVLiquidityOperator: use _addProviderWithVCallateral() instead!"
        );
    }

    /**
     * @notice Adds a new provider.
     * @param _provider The provider to add.
     */
    function _addProviderWithVCallateral(
        address _provider,
        IvToken _vCollateral
    ) public onlyOwner nonReentrant {
        // Approve the USX to the target pool
        LiquidityOperator._addProvider(_provider);

        collateralInfo[_provider].vCollateral = address(_vCollateral);
        collateralInfo[_provider].collateral = _vCollateral.underlying();

        // Enter market for vCollateral
        address[] memory _collaterals = new address[](1);
        _collaterals[0] = address(_vCollateral);
        bool[] memory _results = controller.enterMarkets(_collaterals);
        require(_results[0], "_addProvider: Fail to enter market!");
    }

    /**
     * @notice Remove a provider.
     * @param _provider The provider to remove.
     */
    function _removeProvider(address _provider)
        public
        virtual
        override
        onlyOwner
        nonReentrant
    {
        LiquidityOperator._removeProvider(_provider);

        delete collateralInfo[_provider];

        // controller.exitMarkets([_provider.underlying()]);
    }

    /**
     * @dev Deposit USX to the liquidity pool.
     * @param _amount Amount to borrow from the vault and deposit to the liquidity pool.
     */
    function deposit(uint256 _index, uint256 _amount)
        external
        virtual
        override
        nonReentrant
        onlyWhitelist(msg.sender)
    {
        // TODO: check if the index is valid
        currentProvider = uint8(_index + 1);
        flashVault.flashBorrow(_amount);
    }

    /**
     * @dev Withdraw USX from the liquidity pool
     * @param _amount Amount to withdraw from the pool and repay to the vault.
     */
    function withdraw(uint256 _index, uint256 _amount)
        external
        virtual
        override
        nonReentrant
        onlyWhitelist(msg.sender)
    {
        // TODO: check if the index is valid
        currentProvider = uint8(_index + 1);

        // TODO: calculate exchange rate in provider
        // uint256 _currentExchangeRate = iToken.exchangeRateCurrent();
        // uint256 _actualRepayAmount = _repayAmount.rdivup(_currentExchangeRate);

        IviToken(collateralInfo[providers.at(_index)].vCollateral)
            .flashRedeemUnderlying(_amount);
    }

    /**
     * @notice The callback function of `flashBorrow`, deposit the flashborrowd amount into the target pool
     * @param _amount The amount to borrow.
     */
    function executeFlashBorrow(uint256 _amount) external {
        require(
            msg.sender == address(flashVault),
            "executeFlashBorrow: The caller is not the Falsh Vault iToken!"
        );

        address _provider = providers.at(currentProvider - 1);
        _provider.functionDelegateCall(
            abi.encodeWithSignature("deposit(uint256)", _amount)
        );

        CollateralInfo storage _collateralInfo = collateralInfo[_provider];

        uint256 _collateralBalance = IvToken(_collateralInfo.collateral)
            .balanceOf(address(this));

        IviToken(_collateralInfo.vCollateral).mint(
            address(this),
            _collateralBalance
        );

        currentProvider = 0;
    }

    /**
     * @notice The callback function of `flashRedeemUnderlying`
     *  withdraw the flashRedeemed amount from the target pool and repay back to the flashVault
     * @param _amount The amount to borrow.
     */
    function executeFlashRepay(uint256 _amount) external {
        require(
            msg.sender == address(flashVault),
            "executeFlashRepay: The caller is not the iToken Vault!"
        );

        providers.at(currentProvider - 1).functionDelegateCall(
            abi.encodeWithSignature("withdraw(uint256)", _amount)
        );

        uint256 _underlyingBalance = USX.balanceOf(address(this));

        flashVault.repayBorrow(_underlyingBalance);
    }
}
