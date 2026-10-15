// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {BaseSepoliaFaucet} from "contracts/BaseSepoliaFaucet.sol";
import {HiLoGame} from "contracts/HiLoGame.sol";
import {VRFCoordinatorV2PlusMock} from "contracts/mocks/VRFCoordinatorV2PlusMock.sol";

/// @notice Local-only deployment against Anvil using the deterministic VRF mock.
contract DeployLocal is Script {
    function run() external {
        address admin = vm.envAddress("ADMIN_ADDRESS");
        address relayer = vm.envAddress("RELAYER_ADDRESS");

        vm.startBroadcast(admin);
        VRFCoordinatorV2PlusMock coordinator = new VRFCoordinatorV2PlusMock();
        HiLoGame game = new HiLoGame(admin, address(coordinator), 1, bytes32(uint256(1)), 500_000, 1);
        BaseSepoliaFaucet faucet = new BaseSepoliaFaucet(admin, relayer, 0.01 ether);
        (bool funded,) = address(faucet).call{value: 100 ether}("");
        require(funded, "faucet funding failed");
        vm.stopBroadcast();

        console2.log("COORDINATOR", address(coordinator));
        console2.log("GAME", address(game));
        console2.log("FAUCET", address(faucet));
    }
}
