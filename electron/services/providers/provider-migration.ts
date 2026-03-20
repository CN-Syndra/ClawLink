import type { ProviderConfig } from '../../shared/providers/types';
import {
  getDefaultProviderAccountId,
  providerConfigToAccount,
  saveProviderAccount,
} from './provider-store';
import { getClawLinkProviderStore } from './store-instance';

const PROVIDER_STORE_SCHEMA_VERSION = 1;

export async function ensureProviderStoreMigrated(): Promise<void> {
  const store = await getClawLinkProviderStore();
  const schemaVersion = Number(store.get('schemaVersion') ?? 0);

  if (schemaVersion >= PROVIDER_STORE_SCHEMA_VERSION) {
    return;
  }

  const legacyProviders = (store.get('providers') ?? {}) as Record<string, ProviderConfig>;
  const defaultProviderId = (store.get('defaultProvider') ?? null) as string | null;
  const existingDefaultAccountId = await getDefaultProviderAccountId();

  for (const provider of Object.values(legacyProviders)) {
    const account = providerConfigToAccount(provider, {
      isDefault: provider.id === defaultProviderId,
    });
    await saveProviderAccount(account);
  }

  if (!existingDefaultAccountId && defaultProviderId) {
    store.set('defaultProviderAccountId', defaultProviderId);
  }

  store.set('schemaVersion', PROVIDER_STORE_SCHEMA_VERSION);
}
