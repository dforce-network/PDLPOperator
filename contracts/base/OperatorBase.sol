// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import "../library/Initializable.sol";
import "../library/ReentrancyGuard.sol";
import "../library/Whitelists.sol";

abstract contract OperatorBase is Initializable, ReentrancyGuard, Whitelists {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    IERC20Upgradeable public USX;

    function __OperatorBase_init(IERC20Upgradeable _usx) internal {
        __ReentrancyGuard_init();
        __Whitelist_init();
        __OperatorBase_init_unchained(_usx);
    }

    function __OperatorBase_init_unchained(IERC20Upgradeable _usx) internal {
        require(address(_usx) != address(0), "USX can not be zero address");

        USX = _usx;
    }

    function approve(address _token) external onlyWhitelist(msg.sender) {
        IERC20Upgradeable(_token).approve(msg.sender, uint256(-1));
    }

    // /**
    //  * @notice Only for the owner account.
    //  */
    // function rescueTokens(address _token, uint256 _amount)
    //     external
    //     nonReentrant
    //     onlyOwner
    // {
    //     IERC20Upgradeable(_token).safeTransfer(msg.sender, _amount);
    // }
}
