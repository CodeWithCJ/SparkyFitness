import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDebounce } from '../hooks/useDebounce';
import { useCSSVariable } from 'uniwind';
import { OnlineResultRow } from '../components/foodSearch/FoodSearchResultRow';
import { _transformNormalizedFood } from '../services/api/externalFoodSearchApi';
import { formatLocalizedNumber } from '../localization';
import type { RecipeImportPreview } from '@workspace/shared';
import { fetchExternalProviders } from '../services/api/externalProvidersApi';
import { browseRecipes, previewRecipe } from '../services/api/recipeImportApi';
import { useRecipeImportAccess } from '../hooks/useRecipeImport';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import RecipeImportReview from '../components/recipeImport/RecipeImportReview';
import RecipeImportSavedMappings from '../components/recipeImport/RecipeImportSavedMappings';
import FormInput from '../components/FormInput';
import Button from '../components/ui/Button';
import type { RootStackScreenProps } from '../types/navigation';

function RecipeImportWorkspace({
  scope,
  navigation,
  initialRecipe,
}: {
  scope: string;
  navigation: RootStackScreenProps<'RecipeImport'>['navigation'];
  initialRecipe?: { providerId: string; recipeSlug: string };
}) {
  const { t } = useTranslation();
  const [providerId, setProviderId] = useState(initialRecipe?.providerId ?? '');
  const [initialDismissed, setInitialDismissed] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<RecipeImportPreview | null>(null);
  const [manualBusy, setBusy] = useState(false);
  const debouncedSearch = useDebounce(search.trim(), 300);
  const searching = search.trim() !== debouncedSearch;
  const [accentColor] = useCSSVariable(['--color-accent-primary']) as [string];
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    []
  );
  const providers = useQuery({
    queryKey: ['recipeImportProviders', scope],
    queryFn: fetchExternalProviders,
    retry: false,
  });
  const available =
    providers.data?.filter((provider) => provider.provider_type === 'mealie') ??
    [];
  const selectedProvider = available.find(
    (provider) => provider.id === providerId
  );
  const providerAvailable = !!selectedProvider?.is_active;
  useEffect(() => {
    if (!providers.isSuccess || providerAvailable) return;
    generation.current += 1;
    setPreview(null);
    setBusy(false);
    setInitialDismissed(true);
  }, [providerId, providerAvailable, providers.isSuccess]);
  const recipes = useQuery({
    queryKey: ['recipeImportBrowse', scope, providerId, debouncedSearch, page],
    queryFn: () => browseRecipes(providerId, debouncedSearch, page),
    enabled: !searching && !!selectedProvider?.is_active,
    retry: false,
  });
  const initialPreview = useQuery({
    queryKey: [
      'recipeImportDirect',
      scope,
      initialRecipe?.providerId,
      initialRecipe?.recipeSlug,
    ],
    queryFn: () => previewRecipe(initialRecipe!),
    enabled:
      !initialDismissed &&
      !!initialRecipe &&
      available.some(
        (provider) =>
          provider.id === initialRecipe.providerId && provider.is_active
      ),
    retry: false,
  });
  const busy =
    providerAvailable &&
    (manualBusy ||
      searching ||
      (initialRecipe?.providerId === providerId && initialPreview.isFetching));
  const retainedPreview =
    preview ??
    (!initialDismissed && !initialPreview.isFetching
      ? initialPreview.data
      : null);
  const activePreview =
    providerAvailable && retainedPreview?.providerId === providerId
      ? retainedPreview
      : null;
  async function openRecipe(slug: string) {
    setInitialDismissed(true);
    const request = ++generation.current;
    setBusy(true);
    setError(null);
    try {
      const result = await previewRecipe({ providerId, recipeSlug: slug });
      if (generation.current === request) setPreview(result);
    } catch (failure) {
      if (generation.current === request)
        setError(
          failure instanceof Error
            ? failure.message
            : t('recipeImport.previewFailed', {
                defaultValue: 'Recipe could not be previewed.',
              })
        );
    } finally {
      if (generation.current === request) setBusy(false);
    }
  }
  if (activePreview)
    return (
      <RecipeImportReview
        key={`${scope}:${activePreview.providerId}:${activePreview.recipeSlug}:${activePreview.sourceFingerprint}`}
        preview={activePreview}
        scope={scope}
        navigation={navigation}
        onBack={() => {
          generation.current += 1;
          setInitialDismissed(true);
          setPreview(null);
        }}
      />
    );
  return (
    <View className="gap-4">
      <Text className="text-text-secondary">
        {t('recipeImport.selectProvider', {
          defaultValue: 'Choose your configured Mealie source.',
        })}
      </Text>
      {providers.isLoading && (
        <Text className="text-text-secondary">
          {t('recipeImport.loadingRecipes', {
            defaultValue: 'Loading recipes…',
          })}
        </Text>
      )}
      {providers.error && (
        <Text accessibilityRole="alert" className="text-danger">
          {providers.error.message}
        </Text>
      )}
      {!providers.isLoading && !providers.error && !available.length && (
        <Text className="text-text-secondary">
          {t('recipeImport.noProvider', {
            defaultValue:
              'Configure an active Mealie food provider in Settings first.',
          })}
        </Text>
      )}
      {available.map((provider) => (
        <Button
          key={provider.id}
          variant={providerId === provider.id ? 'primary' : 'secondary'}
          accessibilityRole="button"
          accessibilityState={{ selected: providerId === provider.id }}
          disabled={busy}
          onPress={() => {
            generation.current += 1;
            setInitialDismissed(true);
            setProviderId(provider.id);
            setPreview(null);
            setPage(1);
            setError(null);
          }}
        >
          {provider.is_active
            ? provider.provider_name
            : `${provider.provider_name} (${t('recipeImport.inactive', { defaultValue: 'Inactive' })})`}
        </Button>
      ))}
      {!!selectedProvider && (
        <>
          <RecipeImportSavedMappings
            key={providerId}
            providerId={providerId}
            scope={scope}
          />
          {!selectedProvider.is_active && (
            <Text className="text-text-secondary">
              {t('recipeImport.inactiveManagement', {
                defaultValue:
                  'Activate this provider in Settings to import recipes. Saved choices can still be managed here.',
              })}
            </Text>
          )}
          {selectedProvider.is_active && (
            <>
              <FormInput
                accessibilityLabel={t('recipeImport.search', {
                  defaultValue: 'Search Mealie recipes',
                })}
                placeholder={t('recipeImport.search', {
                  defaultValue: 'Search Mealie recipes',
                })}
                value={search}
                onChangeText={(value) => {
                  generation.current += 1;
                  setSearch(value);
                  setPage(1);
                  setBusy(false);
                }}
              />
              {(recipes.isLoading ||
                searching ||
                initialPreview.isFetching) && (
                <Text className="text-text-secondary">
                  {t('recipeImport.loadingRecipes', {
                    defaultValue: 'Loading recipes…',
                  })}
                </Text>
              )}
              {recipes.error && (
                <Text accessibilityRole="alert" className="text-danger">
                  {recipes.error.message}
                </Text>
              )}
              {recipes.data?.items.map((recipe) => (
                <View key={recipe.slug}>
                  {recipe.food ? (
                    <>
                      <OnlineResultRow
                        item={_transformNormalizedFood(recipe.food, 'mealie')}
                        providerId={providerId}
                        accentColor={accentColor}
                        loadingFoodId={busy ? recipe.slug : null}
                        getProviderColor={() => accentColor}
                        showMacros
                        onSelect={async () => openRecipe(recipe.slug)}
                      />
                      {recipe.recipeServings && (
                        <Text className="text-text-secondary text-xs">
                          {t('recipeImport.recipeYield', {
                            defaultValue: 'Recipe makes {{servings}} servings',
                            count: recipe.recipeServings,
                            servings: formatLocalizedNumber(
                              recipe.recipeServings
                            ),
                          })}
                        </Text>
                      )}
                    </>
                  ) : (
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onPress={() => void openRecipe(recipe.slug)}
                    >
                      {recipe.name}
                    </Button>
                  )}
                </View>
              ))}
              {recipes.data && !recipes.data.items.length && (
                <Text className="text-text-secondary">
                  {t('recipeImport.noRecipes', {
                    defaultValue: 'No recipes found.',
                  })}
                </Text>
              )}
              <View className="flex-row gap-2">
                <Button
                  variant="secondary"
                  disabled={page === 1 || busy}
                  onPress={() => setPage((value) => value - 1)}
                >
                  {t('recipeImport.previous', {
                    defaultValue: 'Previous page',
                  })}
                </Button>
                <Button
                  variant="secondary"
                  disabled={!recipes.data?.pagination.hasMore || busy}
                  onPress={() => setPage((value) => value + 1)}
                >
                  {t('recipeImport.next', { defaultValue: 'Next page' })}
                </Button>
              </View>
            </>
          )}
        </>
      )}
      {error && (
        <Text accessibilityRole="alert" className="text-danger">
          {error}
        </Text>
      )}
      {!initialDismissed && initialPreview.error && (
        <Text accessibilityRole="alert" className="text-danger">
          {initialPreview.error.message}
        </Text>
      )}
    </View>
  );
}

export default function RecipeImportScreen({
  navigation,
  route,
}: RootStackScreenProps<'RecipeImport'>) {
  const { t } = useTranslation();
  const scope = useRecipeImportAccess();
  const insets = useSafeAreaInsets();
  const native = useNativeIOSHeadersActive();
  const padding = useActiveWorkoutBarPadding('stack');
  const header = useScreenHeader({
    title: t('recipeImport.title', {
      defaultValue: 'Import Mealie ingredients',
    }),
    left: { kind: 'back' },
  });
  return (
    <View
      className="flex-1 bg-background"
      style={native ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + padding + 24,
        }}
      >
        {scope ? (
          <RecipeImportWorkspace
            key={`${scope}:${route.params?.scope === scope ? route.params?.recipeSlug : ''}`}
            scope={scope}
            navigation={navigation}
            initialRecipe={
              route.params?.scope === scope
                ? {
                    providerId: route.params.providerId,
                    recipeSlug: route.params.recipeSlug,
                  }
                : undefined
            }
          />
        ) : (
          <Text className="text-text-secondary">
            {t('recipeImport.ownerOnly', {
              defaultValue:
                'Switch to your own profile to import or sync recipes.',
            })}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}
