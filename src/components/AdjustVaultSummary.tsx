import clsx from 'clsx';
import { useAtomValue } from 'jotai';
import { displayFunctionsAtom, offerSignerAtom } from 'store/app';
import {
  adjustVaultErrorsAtom,
  collateralActionAtom,
  collateralInputAmountAtom,
  debtActionAtom,
  debtInputAmountAtom,
  vaultAfterAdjustmentAtom,
  vaultToAdjustAtom,
} from 'store/adjustVault';
import { AmountMath } from '@agoric/ertp';
import { makeAdjustVaultOffer } from 'service/vaults';
import VaultAdjustmentDialog from './VaultAdjustmentDialog';
import { useMemo, useState } from 'react';

type TableRowProps = {
  left: string;
  right: string;
};

const TableRow = ({ left, right }: TableRowProps) => {
  return (
    <tr className="text-[13px] leading-[21px]">
      <td className="text-[#A3A5B9] text-left pr-2">{left}</td>
      <td className="text-right text-[#666980] font-black">{right}</td>
    </tr>
  );
};

type TableRowWithArrowProps = {
  label: string;
  left: string;
  right: string;
};

const TableRowWithArrow = ({ label, left, right }: TableRowWithArrowProps) => {
  return (
    <tr className="text-[13px] leading-[21px]">
      <td className="text-[#A3A5B9] text-left">{label}</td>
      <td className="text-[#666980] font-black px-2">{left}</td>
      <td className="text-[#666980] font-black px-2">&#8594;</td>
      <td className="text-right text-[#666980] font-black">{right}</td>
    </tr>
  );
};

const AdjustVaultSummary = () => {
  const [isVaultAdjustmentDialogOpen, setIsVaultAdjustmentDialogOpen] =
    useState(false);

  const displayFunctions = useAtomValue(displayFunctionsAtom);
  assert(
    displayFunctions,
    'Adjust vault requires display functions to be loaded',
  );
  const { displayAmount, displayBrandPetname, displayPercent } =
    displayFunctions;

  const debtInputAmount = useAtomValue(debtInputAmountAtom);
  const collateralInputAmount = useAtomValue(collateralInputAmountAtom);
  const debtAction = useAtomValue(debtActionAtom);
  const collateralAction = useAtomValue(collateralActionAtom);
  const { collateralError, debtError } = useAtomValue(adjustVaultErrorsAtom);
  const vaultToAdjust = useAtomValue(vaultToAdjustAtom);
  const vaultAfterAdjustment = useAtomValue(vaultAfterAdjustmentAtom);
  assert(
    vaultToAdjust && vaultAfterAdjustment,
    'Adjust vault requires a vault selected',
  );

  const {
    totalDebt,
    locked,
    params,
    collateralizationRatio,
    createdByOfferId,
    vaultState,
  } = vaultToAdjust;

  const isActive = vaultState === 'active';

  const offerSigner = useAtomValue(offerSignerAtom);

  const { newDebt, newLocked, newCollateralizationRatio } =
    vaultAfterAdjustment;

  const newDebtForDisplay = AmountMath.isEqual(newDebt, totalDebt)
    ? '---'
    : `${displayAmount(newDebt, 2, 'locale')} ${displayBrandPetname(
        totalDebt.brand,
      )}`;

  const newLockedForDisplay = AmountMath.isEqual(newLocked, locked)
    ? '---'
    : `${displayAmount(newLocked, 2, 'locale')} ${displayBrandPetname(
        locked.brand,
      )}`;

  const hasErrors = collateralError || debtError;
  const canMakeOffer =
    !hasErrors &&
    isActive &&
    (debtInputAmount?.value || collateralInputAmount?.value) &&
    offerSigner?.isDappApproved;

  const isButtonDisabled = !canMakeOffer;

  const offerButtonLabel = useMemo(() => {
    if (!offerSigner?.isDappApproved) {
      assert(
        isButtonDisabled,
        'Button should be disabled when dapp is not enabled in wallet',
      );
      return 'Enable Dapp in Wallet';
    }

    if (!isActive) {
      assert(
        isButtonDisabled,
        'Button should be disabled when vault is not active',
      );

      return vaultState;
    }

    return 'Make Offer';
  }, [isButtonDisabled, isActive, offerSigner?.isDappApproved, vaultState]);

  const makeAdjustOffer = async () => {
    assert(canMakeOffer);

    const collateral = collateralInputAmount
      ? {
          amount: collateralInputAmount,
          action: collateralAction,
        }
      : undefined;

    const debt = debtInputAmount
      ? {
          amount: debtInputAmount,
          action: debtAction,
        }
      : undefined;

    await makeAdjustVaultOffer({
      vaultOfferId: createdByOfferId,
      collateral,
      debt,
    });

    setIsVaultAdjustmentDialogOpen(true);
  };

  return (
    <>
      <div className="w-full pt-[28px] pb-3 bg-white rounded-[10px] shadow-[0_22px_34px_0_rgba(116,116,116,0.25)]">
        <div className="px-8">
          <h3 className="mb-4 font-serif text-[22px] font-extrabold leading-[35px]">
            Vault Summary
          </h3>
          <h4 className="font-serif font-bold leading-[26px]">
            Confirm Details
          </h4>
          <div className="w-full p-2">
            <table className="w-full">
              <tbody>
                <TableRowWithArrow
                  label="Depositing"
                  left={`${displayAmount(
                    locked,
                    2,
                    'locale',
                  )} ${displayBrandPetname(locked.brand)}`}
                  right={newLockedForDisplay}
                />
                <TableRowWithArrow
                  label="Borrowing"
                  left={`${displayAmount(
                    totalDebt,
                    2,
                    'locale',
                  )} ${displayBrandPetname(totalDebt.brand)}`}
                  right={newDebtForDisplay}
                />
                <TableRowWithArrow
                  label="Collateralization Ratio"
                  left={
                    collateralizationRatio
                      ? displayPercent(collateralizationRatio, 0) + '%'
                      : 'N/A'
                  }
                  right={
                    newCollateralizationRatio
                      ? displayPercent(newCollateralizationRatio, 0) + '%'
                      : 'N/A'
                  }
                />
              </tbody>
            </table>
          </div>
          <div className="w-full h-[1px] bg-[#D8D8D8]"></div>
          <div className="w-full p-2">
            <table className="w-full">
              <tbody>
                <TableRow
                  left="Min. Collateralization Ratio"
                  right={`${displayPercent(
                    params.inferredMinimumCollateralization,
                    0,
                  )}%`}
                />
                <TableRow
                  left="Liquidation Ratio"
                  right={`${displayPercent(params.liquidationMargin, 0)}%`}
                />
                <TableRow
                  left="Interest Rate"
                  right={`${displayPercent(params.interestRate, 2)}%`}
                />
              </tbody>
            </table>
          </div>
        </div>
        <div
          className={clsx(
            'transition mt-3 mx-3 p-6 rounded-b-[10px]',
            canMakeOffer ? 'bg-[#F3EFF9]' : '',
          )}
        >
          <button
            disabled={isButtonDisabled}
            onClick={makeAdjustOffer}
            className={clsx(
              'transition w-full py-3 text-white font-extrabold text-sm rounded-[6px]',
              canMakeOffer
                ? 'bg-interPurple shadow-[0px_13px_20px_-6px_rgba(125,50,222,0.25)] hover:opacity-80 active:opacity-70'
                : 'bg-[#C1C3D7] cursor-not-allowed',
            )}
          >
            {offerButtonLabel}
          </button>
        </div>
      </div>
      <VaultAdjustmentDialog
        isOpen={isVaultAdjustmentDialogOpen}
        onClose={() => setIsVaultAdjustmentDialogOpen(false)}
      />
    </>
  );
};

export default AdjustVaultSummary;
