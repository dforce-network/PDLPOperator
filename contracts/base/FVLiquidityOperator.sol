// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts-upgradeable/utils/EnumerableSetUpgradeable.sol";

import "../library/SafeRatioMath.sol";
import "./VaultBase.sol";
import "./LiquidityOperator.sol";

interface IFlashVault {
    function isiToken() external returns (bool);

    function underlying() external returns (address);

    function controller() external returns (address);

    function mint(address _to, uint256 _amount) external;

    function balanceOf(address _account) external returns (uint256);

    function repayBorrow(uint256 _repayAmount) external;

    function flashBorrow(uint256 _borrowAmount) external;
}

interface IVCollateral {
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

abstract contract Gap {
    uint256[10] private __gap;
}

abstract contract FVLiquidityOperator is OperatorBase, Gap, LiquidityOperator {
    using SafeRatioMath for uint256;

    IFlashVault public flashVault;

    IControllerFlashVault public controller;

    // provider index for callback dispatch, starts from 1
    uint8 internal currentProvider;

    struct CollateralInfo {
        address collateral;
        address vCollateral;
    }

    mapping(address => CollateralInfo) public collateralInfo;

    function __FVLiquidityOperator_init(
        IERC20Upgradeable _usx,
        IFlashVault _flashVault
    ) internal {
        __OperatorBase_init(_usx);
        __LiquidityOperator_init_unchained();
        __FVLiquidityOperator_init_unchained(_flashVault);
    }

    function __FVLiquidityOperator_init_unchained(IFlashVault _flashVault)
        internal
    {
        // Make sure the flashVault is a iToken, it could be a vToken or a vMSD
        _flashVault.isiToken();

        require(
            _flashVault.underlying() == address(USX),
            "Flash Vault underlying is not USX!"
        );

        flashVault = _flashVault;
        controller = IControllerFlashVault(_flashVault.controller());

        USX.approve(address(flashVault), uint256(-1));
    }

    function _addProvider(address) public virtual override {
        revert("_addProvider: use _addProviderWithVCollateral() instead!");
    }

    /**
     * @notice Adds a new provider, _addProvider will check against reentrancy
     * @param _provider The provider to add.
     */
    function _addProviderWithVCollateral(
        address _provider,
        IVCollateral _vCollateral
    ) public onlyOwner {
        // TODO: check whether _provider and _vCollateral matches

        require(
            _vCollateral.controller() == address(controller),
            "VCollateral and flash Vault controller mismatch!"
        );

        // Approve the USX to the target pool
        LiquidityOperator._addProvider(_provider);

        collateralInfo[_provider].vCollateral = address(_vCollateral);
        collateralInfo[_provider].collateral = _vCollateral.underlying();

        // approve to vCollateral
        IERC20Upgradeable(address(collateralInfo[_provider].collateral))
            .approve(address(_vCollateral), uint256(-1));

        // Enter market for vCollateral
        address[] memory _collaterals = new address[](1);
        _collaterals[0] = address(_vCollateral);
        bool[] memory _results = controller.enterMarkets(_collaterals);
        // enterMarkets will return true if it succeeds
        require(
            _results[0],
            "_addProviderWithVCollateral: Fail to enter market!"
        );
    }

    /**
     * @notice Remove a provider, _removeProvider will check against reentrancy
     * @param _provider The provider to remove.
     */
    function _removeProvider(address _provider)
        public
        virtual
        override
        onlyOwner
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
        require(_index < providers.length(), "index out of bounds");

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
        require(_index < providers.length(), "index out of bounds");

        currentProvider = uint8(_index + 1);

        // calculate the LP amount should be redeemed
        uint256 _currentExchangeRate = IProvider(providers.at(_index))
            .exchangeRateCurrent();
        uint256 _redeemAmount = _amount.rdivup(_currentExchangeRate);

        IVCollateral(collateralInfo[providers.at(_index)].vCollateral)
            .flashRedeemUnderlying(_redeemAmount);
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

        // Deposit the flashborrowd amount into the target pool
        address _provider = providers.at(currentProvider - 1);
        _provider.functionDelegateCall(
            abi.encodeWithSignature("deposit(uint256)", _amount)
        );

        // Put the deposit LP token back as collateral
        CollateralInfo storage _collateralInfo = collateralInfo[_provider];
        uint256 _collateralBalance = IERC20Upgradeable(
            _collateralInfo.collateral
        ).balanceOf(address(this));

        IVCollateral(_collateralInfo.vCollateral).mint(
            address(this),
            _collateralBalance
        );

        currentProvider = 0;
    }

    /**
     * @notice The callback function of `flashRedeemUnderlying`
     *  withdraw the flashRedeemed amount from the target pool and repay back to the flashVault
     * @param _amount The amount to repay.
     */
    function executeFlashRepay(uint256 _amount) external {
        address _provider = providers.at(currentProvider - 1);

        require(
            msg.sender == (collateralInfo[_provider]).vCollateral,
            "executeFlashRepay: The caller is not the corresponding vCollateral!"
        );

        // Withdraw the flashRedeemed LP from the target pool
        // Multiply the current exchange rate as `withdraw` calls `redeemUnderlying`
        _provider.functionDelegateCall(
            abi.encodeWithSignature(
                "withdraw(uint256)",
                _amount.rmul(IProvider(_provider).exchangeRateCurrent())
            )
        );

        // Repay the withdrawn USX back to the flash vault
        uint256 _underlyingBalance = USX.balanceOf(address(this));
        flashVault.repayBorrow(_underlyingBalance);

        currentProvider = 0;
    }
}
