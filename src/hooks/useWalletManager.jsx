import React, { createContext, useContext, useState, useEffect } from "react";
import { CashuMint, CashuWallet } from "@cashu/cashu-ts";

/**
 * @typedef {Object} WalletContextType
 * @property {Map<string, CashuWallet>} wallets - Map of wallet keysetIds to CashuWallet instances
 * @property {boolean} isLoading - Indicates if wallets are still loading
 * @property {(url: string, unit?: string) => Promise<void>} addWallet - Function to add a new wallet
 * @property {CashuWallet | null} activeWallet - Currently active wallet
 * @property {(wallet: CashuWallet, keysetId: string) => void} setActiveWallet - Function to set the active wallet
 */

/** @type {React.Context<WalletContextType | undefined>} */
const WalletContext = createContext(undefined);

const addWalletToLocalStorage = (url, keysetId, unit, keys) => {
  const mintUrls = JSON.parse(localStorage.getItem("mintUrls") || "[]");
  if (!mintUrls.includes(url)) {
    mintUrls.push(url);
    localStorage.setItem("mintUrls", JSON.stringify(mintUrls));
  }

  const mintData = JSON.parse(localStorage.getItem(url) || "{}");
  if (!mintData.keysets) {
    mintData.keysets = [];
  }
  mintData.keysets.push({ keysetId, unit, keys });
  localStorage.setItem(url, JSON.stringify(mintData));
};

const setActiveWalletInLocalStorage = (keysetId) => {
  console.log("Setting active wallet to keysetId:", keysetId);
  if (keysetId) {
    localStorage.setItem("activeWalletKeysetId", keysetId);
  } else {
    console.warn("Attempted to set undefined keysetId as active wallet");
  }
};

/**
 * The mints and wallets we add along with their keysets will be stored locally.
 *
 * Local Storage State Summary:
 *
 * 1. "mintUrls": JSON array of mint URLs
 *    - Stores all unique mint URLs added by the user
 *
 * 2. For each mint URL (stored using the URL as the key):
 *    - JSON object containing:
 *      {
 *        keysets: [
 *          {
 *            keysetId: string,
 *            unit: string,
 *            keys: MintKeys
 *          },
 *          ...
 *        ]
 *      }
 *    - Stores keyset information for each mint
 *
 * 3. "activeWalletKeysetId": string
 *    - Stores the keysetId of the currently active wallet
 */

export const WalletProvider = ({ children }) => {
  const [wallets, setWallets] = useState(new Map());
  const [activeWallet, setActiveWalletState] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    /* initialize wallets from mint data in localStorage */
    const load = async () => {
      let mintUrls = JSON.parse(localStorage.getItem("mintUrls") || "[]");

      // If no wallets are in localStorage, add the default mint
      if (mintUrls.length === 0) {
        const defaultMintUrl = "https://nofees.testnut.cashu.space";
        mintUrls.push(defaultMintUrl);
        localStorage.setItem("mintUrls", JSON.stringify(mintUrls));
        await addWallet(defaultMintUrl, "sat");
      }

      console.log("Loading wallets for mint urls:", mintUrls);

      /** @type {Array<{url: string, keysetId: string, unit: string, keys: MintKeys}>} */
      const walletsToInitialize = mintUrls.flatMap((url) => {
        const mintData = JSON.parse(localStorage.getItem(url) || "{}");

        if (!mintData.keysets || mintData.keysets.length === 0) {
          console.warn(`No keysets found for ${url}`);
          return [];
        }

        return mintData.keysets.map((keyset) => ({
          ...keyset,
          url,
        }));
      });

      const walletsTemp = new Map();
      const mintKeysets = new Map();

      for await (const walletData of walletsToInitialize) {
        const mint = new CashuMint(walletData.url);

        let keysets;
        if (!mintKeysets.has(walletData.url)) {
          try {
            keysets = await mint.getKeySets();
            mintKeysets.set(walletData.url, keysets);
          } catch (error) {
            console.warn(
              `Failed to fetch keysets for ${walletData.url}. Using local data.`
            );
            keysets = { keysets: [{ id: walletData.keysetId, active: true }] };
          }
        } else {
          keysets = mintKeysets.get(walletData.url);
        }

        const keyset = keysets.keysets.find(
          (keyset) => keyset.id === walletData.keysetId
        );

        if (!keyset) {
          console.warn(`Keyset ${walletData.keysetId} not found`);
        }
        if (keyset && keyset.active !== true) {
          console.warn(
            `Keyset ${walletData.keysetId} is no longer active, you should rotate to the new keyset`
          );
        }

        const wallet = new CashuWallet(mint, {
          keys: {
            unit: walletData.unit,
            id: walletData.keysetId,
            keys: walletData.keys,
          },
        });

        walletsTemp.set(walletData.keysetId, wallet);
      }

      setWallets(walletsTemp);
      console.log("Wallets loaded:", walletsTemp);

      /* Set active wallet from local storage */
      const activeWalletKeysetId = localStorage.getItem("activeWalletKeysetId");
      console.log("Active wallet keyset id:", activeWalletKeysetId);

      if (activeWalletKeysetId && walletsTemp.has(activeWalletKeysetId)) {
        setActiveWallet(
          walletsTemp.get(activeWalletKeysetId),
          activeWalletKeysetId
        );
      } else if (walletsTemp.size > 0) {
        const firstWallet = walletsTemp.entries().next().value;
        setActiveWallet(firstWallet[1], firstWallet[0]);
      }
    };
    load().then(() => setIsLoading(false));
  }, []);

  const addWallet = async (url, unit = "sat") => {
    console.log("Adding wallet:", url, unit);

    console.log("Fetching keys...");
    const mint = new CashuMint(url);
    const keysets = await mint.getKeySets();
    const keysetForUnit = keysets.keysets.find(
      (keyset) => keyset.unit === unit && /^[0-9A-Fa-f]+$/.test(keyset.id)
    );
    if (!keysetForUnit) {
      throw new Error(`No keyset found for unit ${unit}`);
    }
    console.log("Found keyset:", keysetForUnit);
    const keysResponse = await mint.getKeys(keysetForUnit.id);
    const keys = keysResponse.keysets.find((k) => k.id === keysetForUnit.id);
    const walletOptions = {
      unit,
      keys,
      mnemonicOrSeed: undefined,
    };
    console.log("Creating wallet:", walletOptions);
    const wallet = new CashuWallet(mint, walletOptions);
    setWallets((wallets) => new Map([...wallets, [keysetForUnit.id, wallet]]));
    addWalletToLocalStorage(url, keysetForUnit.id, unit, keys);
    if (activeWallet === null) {
      setActiveWallet(wallet, keysetForUnit.id);
    }
  };

  const setActiveWallet = (wallet, keysetId) => {
    if (wallet && keysetId) {
      setActiveWalletState(wallet);
      setActiveWalletInLocalStorage(keysetId);
    } else {
      console.warn("Attempted to set invalid active wallet", {
        wallet,
        keysetId,
      });
    }
  };

  /** @type {WalletContextType} */
  const value = {
    wallets,
    isLoading,
    addWallet,
    activeWallet,
    setActiveWallet,
  };

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
};

export const useWalletManager = () => {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWalletManager must be used within a WalletProvider");
  }
  return context;
};
