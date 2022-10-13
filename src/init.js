import * as nearAPI from "near-api-js";
import { getConfig } from "@ref_finance/ref-sdk";
const { keyStores, connect, Near, WalletConnection, ConnectedWalletAccount } = nearAPI;
const config = getConfig();
config.keyStore = new keyStores.BrowserLocalStorageKeyStore();
export const near = new Near({
  keyStore: new keyStores.InMemoryKeyStore(),
  headers: {},
  ...config,
});
export const wallet = new WalletConnection(near, "swap_demo_app");
// export const walletAccount = new ConnectedWalletAccount(wallet, wallet._near.connection, wallet._authData.accountId)
