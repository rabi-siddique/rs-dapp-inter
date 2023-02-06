import { atom } from 'jotai';
import { vaultStore } from './vaults';
import { makeRatioFromAmounts } from '@agoric/zoe/src/contractSupport';
import { computeToLock, computeToReceive } from 'utils/vaultMath';
import { pursesAtom } from './app';
import { ratioGTE } from '@agoric/zoe/src/contractSupport/ratio';
import { AmountMath } from '@agoric/ertp';
import type { Ratio } from './vaults';
import type { Amount } from '@agoric/ertp/src/types';

const valueToLockInternal = atom<bigint | null>(null);
const valueToReceiveInternal = atom<bigint | null>(null);
const collateralizationRatioInternal = atom<Ratio | null>(null);
const selectedCollateralIdInternal = atom<string | null>(null);

const getVaultInputData = (selectedCollateralId: string) => {
  const { vaultMetrics, vaultGovernedParams, prices } = vaultStore.getState();

  const collateralBrand =
    selectedCollateralId && vaultMetrics?.has(selectedCollateralId)
      ? vaultMetrics.get(selectedCollateralId)?.retainedCollateral.brand
      : null;

  const collateralPriceDescription =
    collateralBrand && prices.get(collateralBrand);

  const priceRate =
    collateralPriceDescription &&
    makeRatioFromAmounts(
      collateralPriceDescription.amountOut,
      collateralPriceDescription.amountIn,
    );

  const selectedParams =
    selectedCollateralId && vaultGovernedParams?.has(selectedCollateralId)
      ? vaultGovernedParams.get(selectedCollateralId)
      : null;

  // TODO: Use min collateral ratio rather than liquidation margin when available.
  const defaultCollateralizationRatio = selectedParams
    ? selectedParams.liquidationMargin
    : null;

  return { defaultCollateralizationRatio, priceRate };
};

export type VaultCreationErrors = {
  toLockError?: string;
  toReceiveError?: string;
  collateralizationRatioError?: string;
};

export const valueToLockAtom = atom(
  get => get(valueToLockInternal),
  (get, set, value: bigint) => {
    set(valueToLockInternal, value);

    const selectedCollateralId = get(selectedCollateralIdInternal);
    if (!selectedCollateralId) {
      return;
    }

    const collateralizationRatio = get(collateralizationRatioInternal);
    const { priceRate, defaultCollateralizationRatio } =
      getVaultInputData(selectedCollateralId);

    if (priceRate && defaultCollateralizationRatio && collateralizationRatio) {
      set(
        valueToReceiveInternal,
        computeToReceive(
          priceRate,
          collateralizationRatio,
          value,
          defaultCollateralizationRatio,
        ),
      );
    }
  },
);

export const valueToReceiveAtom = atom(
  get => get(valueToReceiveInternal),
  (get, set, value: bigint) => {
    set(valueToReceiveInternal, value);

    const selectedCollateralId = get(selectedCollateralIdInternal);
    if (!selectedCollateralId) {
      return;
    }

    const collateralizationRatio = get(collateralizationRatioInternal);
    const { priceRate, defaultCollateralizationRatio } =
      getVaultInputData(selectedCollateralId);

    if (priceRate && defaultCollateralizationRatio && collateralizationRatio) {
      set(
        valueToLockInternal,
        computeToLock(
          priceRate,
          collateralizationRatio,
          value,
          defaultCollateralizationRatio,
        ),
      );
    }
  },
);

export const collateralizationRatioAtom = atom(
  get => get(collateralizationRatioInternal),
  (get, set, ratio: Ratio) => {
    set(collateralizationRatioInternal, ratio);

    const valueToLock = get(valueToLockInternal);
    const selectedCollateralId = get(selectedCollateralIdInternal);
    if (!(valueToLock && selectedCollateralId)) {
      return;
    }

    const { priceRate, defaultCollateralizationRatio } =
      getVaultInputData(selectedCollateralId);

    if (priceRate && defaultCollateralizationRatio) {
      set(
        valueToReceiveInternal,
        computeToReceive(
          priceRate,
          ratio,
          valueToLock,
          defaultCollateralizationRatio,
        ),
      );
    }
  },
);

export const selectedCollateralIdAtom = atom(
  get => get(selectedCollateralIdInternal),
  (_get, set, selectedCollateralId: string | null) => {
    set(selectedCollateralIdInternal, selectedCollateralId);

    if (selectedCollateralId === null) {
      set(valueToReceiveInternal, null);
      set(valueToLockInternal, null);
      set(collateralizationRatioInternal, null);
      return;
    }

    const { priceRate, defaultCollateralizationRatio } =
      getVaultInputData(selectedCollateralId);

    if (defaultCollateralizationRatio) {
      set(collateralizationRatioInternal, defaultCollateralizationRatio);
    } else {
      set(collateralizationRatioInternal, null);
    }

    const { vaultFactoryParams } = vaultStore.getState();
    const defaultValueReceived = vaultFactoryParams?.minInitialDebt;
    if (defaultValueReceived) {
      set(valueToReceiveInternal, defaultValueReceived.value);
    } else {
      set(valueToReceiveInternal, null);
    }

    if (defaultCollateralizationRatio && priceRate && defaultValueReceived) {
      const valueToLock = computeToLock(
        priceRate,
        defaultCollateralizationRatio,
        defaultValueReceived.value,
        defaultCollateralizationRatio,
      );
      set(valueToLockInternal, valueToLock);
    } else {
      set(valueToLockInternal, null);
    }
  },
);

export const inputErrorsAtom = atom<VaultCreationErrors>(get => {
  let toLockError;
  let toReceiveError;
  let collateralizationRatioError;

  const collateralizationRatio = get(collateralizationRatioAtom);
  const selectedCollateralId = get(selectedCollateralIdAtom);
  const valueToReceive = get(valueToReceiveAtom);
  const valueToLock = get(valueToLockAtom);
  const purses = get(pursesAtom);

  const { vaultGovernedParams, vaultMetrics, vaultFactoryParams } =
    vaultStore.getState();

  const selectedParams =
    selectedCollateralId && vaultGovernedParams?.has(selectedCollateralId)
      ? vaultGovernedParams.get(selectedCollateralId)
      : null;

  if (selectedParams && collateralizationRatio) {
    // TODO: Use min collateral ratio rather than liquidation margin when available.
    const defaultCollateralizationRatio = selectedParams.liquidationMargin;
    if (
      collateralizationRatio.numerator.value === 0n ||
      !ratioGTE(collateralizationRatio, defaultCollateralizationRatio)
    ) {
      collateralizationRatioError = 'Below minimum';
    }
  }

  const selectedMetrics =
    selectedCollateralId && vaultMetrics?.has(selectedCollateralId)
      ? vaultMetrics.get(selectedCollateralId)
      : null;

  if (selectedMetrics && selectedParams && valueToReceive) {
    const istAvailable = AmountMath.subtract(
      selectedParams.debtLimit,
      selectedMetrics.totalDebt,
    ).value;

    if (istAvailable < valueToReceive) {
      toReceiveError = 'Exceeds amount available';
    }
  }

  const minInitialDebt = vaultFactoryParams?.minInitialDebt?.value ?? 0n;

  if (selectedCollateralId && minInitialDebt > 0n) {
    if (!valueToReceive || valueToReceive < minInitialDebt) {
      toReceiveError = 'Below minimum';
    }
  }

  if (selectedMetrics) {
    if (!purses) {
      toLockError = 'Need to connect wallet';
    } else {
      const collateralPurse = purses.find(
        ({ brand }) => brand === selectedMetrics.totalCollateral.brand,
      );

      if (
        !collateralPurse ||
        (collateralPurse.currentAmount as Amount<'nat'>).value <
          (valueToLock ?? 0n)
      ) {
        toLockError = 'Need to obtain funds';
      }
    }
  }

  return { toLockError, toReceiveError, collateralizationRatioError };
});
