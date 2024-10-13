import { MintQuoteState } from "@cashu/cashu-ts";
import { useState, useEffect } from "react";
import { useProofStorage } from "./useProofStorage";
import { useWalletManager } from "./useWalletManager";

class InsufficientBalanceError extends Error {
  constructor(balance, amount) {
    super(`Insufficient balance: ${balance} sats, required: ${amount} sats`);
    this.name = "InsufficientBalanceError";
  }
}

/**
 * @param {CashuWallet} wallet
 */
const useCashuWallet = () => {
  const { addProofs, removeProofs, getProofsByAmount, balance } =
    useProofStorage();
  const { activeWallet: wallet } = useWalletManager();

  const [pollInterval, setPollInterval] = useState(null);

  /* stop polling when component is unmounted (not rendered) */
  useEffect(() => {
    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [pollInterval]);

  /**
   * Generate an invoice from the mint, and mint tokens when the invoice gets paid
   * @param {number} amount - amount to receive in sats
   * @param {() => void} handleSuccess - function to call when payment is successful
   * @returns {Promise<string>} invoice - and continues to poll until invoice is paid
   */
  const receiveLightningPayment = async (amount, handleSuccess) => {
    const mintQuote = await wallet.createMintQuote(amount);
    const invoice = mintQuote.request;
    const quoteId = mintQuote.quote;

    console.log("Mint quote:", mintQuote);

    // TODO: we should store the mint quote until we have minted tokens
    // because the invoice might get paid, but if we stop polling (refresh etc.), we will
    // not be able to mint tokens

    /* poll for invoice payment */
    const startPolling = () => {
      const interval = setInterval(async () => {
        try {
          /* check mint quote status */
          const quote = await wallet.checkMintQuote(quoteId);
          console.log("Quote status:", quote);
          if (quote.state === MintQuoteState.PAID) {
            /* mint tokens */
            const { proofs } = await wallet.mintTokens(amount, quoteId);
            addProofs(proofs); /* store created proofs */
            clearInterval(interval); /* stop polling */
            handleSuccess(); /* call success callback */
          } else if (quote.state === MintQuoteState.ISSUED) {
            /* shouldn't happen, but just in case */
            console.warn("Mint quote issued");
            clearInterval(interval); /* stop polling */
          } else if (quote.state === MintQuoteState.UNPAID) {
            console.log("Waiting for payment...", mintQuote);
          } else {
            console.warn("Unknown mint quote state:", quote.state);
          }
        } catch (error) {
          console.error("Error while polling for payment:", error);
        }
      }, 5000); // Poll every 5 seconds
      setPollInterval(interval);
    };

    startPolling();
    return invoice;
  };

  /**
   * Use locally stored proofs to pay an invoice
   * @param {string} invoice - lightning invoice to pay
   */
  const sendLightningPayment = async (invoice) => {
    const meltQuote = await wallet.createMeltQuote(invoice);

    /* mint will reserve a fee for the lightning payment */
    const amount = meltQuote.amount + meltQuote.fee_reserve;

    /* this just reads from local storage, but does not delete */
    const proofsToSend = getProofsByAmount(amount, wallet.keys.id);

    if (!proofsToSend) {
      throw new InsufficientBalanceError(balance, amount);
    }

    const { change, isPaid, preimage } = await wallet.meltTokens(
      meltQuote,
      proofsToSend
    );

    addProofs(change);

    if (isPaid) {
      console.log("Payment was successful", preimage);
      /* delete proofs we pulled from local storage */
      removeProofs(proofsToSend);
    } else {
      console.log("Payment failed");
    }
  };

  /**
   * Swap proofs from one wallet to another
   * @param {CashuWallet} to - wallet to swap proofs to
   * @param {Array<Proof>} proofs - proofs to swap
   * @returns {Promise<number>} totalMinted - amount we were able to mint to the `to` mint
   */
  const crossMintSwap = async (to, proofs) => {
    /* mint to swap from (our active wallet) */
    const from = wallet;

    if (from.keys.unit !== to.keys.unit) {
      // TODO: if units are different, convert the proofs to the `to` unit
      throw new Error(
        "It is possible to swap between units but that requires us to fetch the exchange rate to convert the amounts, so we will not do that"
      );
    }

    /* make sure proofs are ALL from the `from` wallet */
    const proofIds = new Set(proofs.map((p) => p.id));
    if (proofIds.size > 1) {
      throw new Error("make sure proofs are all from the same keyset");
    } else if (proofs[0].id !== from.keys.id) {
      throw new Error(
        `Keyset ID ${from.keys.id} does not match proof's id ${proofs[0].id}`
      );
    }

    /* add up all the proofs */
    const totalProofAmount = proofs.reduce((acc, p) => (acc += p.amount), 0);
    console.log("## Amount to swap:", totalProofAmount);

    /* set max so we don't go into an infinite loop */
    const maxAttempts = 5;
    let attempts = 0;

    let amountToMint = totalProofAmount;
    let meltQuote;
    let mintQuote;

    /* loop until we find a valid melt quote */
    while (attempts <= maxAttempts) {
      attempts++;
      console.log("===============================\nAttempt #", attempts);

      /* request a quote to mint tokens */
      mintQuote = await to.createMintQuote(amountToMint);

      /* `request` is the invoice we need to pay in order to mint ecash */
      const invoice = mintQuote.request;

      /* use the mint quote to get a melt quote */
      meltQuote = await from.createMeltQuote(invoice);

      /* need to give the amount to melt along with a fee for the lightning payment */
      const amountRequiredToMelt = meltQuote.amount + meltQuote.fee_reserve;

      if (amountRequiredToMelt <= totalProofAmount) {
        /* exit the loop bc we found a valid melt quote */
        amountToMint = amountRequiredToMelt;
        break;
      }

      /* subtract the difference between what we have and what we need, then try again */
      const difference = amountRequiredToMelt - totalProofAmount;
      amountToMint = amountToMint - difference;
    }

    if (amountToMint > totalProofAmount || !mintQuote || !meltQuote) {
      /* loop exited because attempts > maxAttempts or failed to get quotes */
      throw new Error(`Could not find a valid melt quote`);
    }

    /* the mint may over estimate the lightning fee. If they implement NUT08, we get change */
    const { isPaid, change } = await from.meltTokens(meltQuote, proofs);

    if (!isPaid) {
      throw new Error("melt faild");
    } else {
      /* havent minted yet, but proofs are spent so remove them  */
      removeProofs(proofs);
    }

    const { proofs: newProofs } = await to.mintTokens(
      amountToMint - meltQuote.fee_reserve,
      mintQuote.quote
    );

    const totalMinted = newProofs.reduce((acc, p) => (acc += p.amount), 0);

    /* store what we minted and change */
    addProofs([...newProofs, ...change]);

    return totalMinted;
  };

  return { receiveLightningPayment, sendLightningPayment, crossMintSwap };
};

export default useCashuWallet;
