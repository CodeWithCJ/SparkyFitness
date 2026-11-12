import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
}: {
  scope: string;
  navigation: RootStackScreenProps<'RecipeImport'>['navigation'];
}) {
  const { t } = useTranslation();
  const [providerId, setProviderId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<RecipeImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
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
    providers.data?.filter(
      (provider) => provider.provider_type === 'mealie' && provider.is_active
    ) ?? [];
  const recipes = useQuery({
    queryKey: ['recipeImportBrowse', scope, providerId, search, page],
    queryFn: () => browseRecipes(providerId, search, page),
    enabled: !!providerId,
    retry: false,
  });
  async function openRecipe(slug: string) {
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
  if (preview)
    return (
      <RecipeImportReview
        key={`${scope}:${preview.providerId}:${preview.recipeSlug}:${preview.sourceFingerprint}`}
        preview={preview}
        scope={scope}
        navigation={navigation}
        onBack={() => {
          generation.current += 1;
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
            setProviderId(provider.id);
            setPage(1);
            setError(null);
          }}
        >
          {provider.provider_name}
        </Button>
      ))}
      {!!providerId && (
        <>
          <RecipeImportSavedMappings
            key={providerId}
            providerId={providerId}
            scope={scope}
          />
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
          {recipes.isLoading && (
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
            <Button
              key={recipe.slug}
              variant="secondary"
              disabled={busy}
              onPress={() => void openRecipe(recipe.slug)}
            >
              {recipe.name}
            </Button>
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
              {t('recipeImport.previous', { defaultValue: 'Previous page' })}
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
      {error && (
        <Text accessibilityRole="alert" className="text-danger">
          {error}
        </Text>
      )}
    </View>
  );
}

export default function RecipeImportScreen({
  navigation,
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
            key={scope}
            scope={scope}
            navigation={navigation}
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
