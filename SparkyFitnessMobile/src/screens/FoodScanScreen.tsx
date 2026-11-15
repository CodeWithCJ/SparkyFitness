import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
  Button,
  StyleSheet,
  ActivityIndicator,
  Image,
  Modal,
  KeyboardAvoidingView,
  ScrollView,
  AppState,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { CommonActions, useIsFocused } from '@react-navigation/native';
import UIButton from '../components/ui/Button';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import FormInput from '../components/FormInput';
import SegmentedControl from '../components/SegmentedControl';
import LabelPhotoCropper from '../components/LabelPhotoCropper';
import type { RootStackScreenProps } from '../types/navigation';
import { barcodeResultToFoodInfo } from '../utils/barcodeFoods';
import { getActiveServerConfig } from '../services/storage';
import { useCSSVariable } from 'uniwind';
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
  type BarcodeSettings,
} from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import {
  lookupBarcodeV2,
  scanNutritionLabel,
} from '../services/api/externalFoodSearchApi';
import { getApiErrorMessage } from '../services/api/errors';
import { TimeoutError } from '../utils/concurrency';
import { fireSuccessHaptic } from '../services/haptics';
import {
  isOnDeviceLabelScanAvailable,
  scanLabelOnDevice,
} from '../services/onDeviceLabelScan';
import {
  LABEL_MAX_DIMENSION,
  prepareLabelPhoto,
  type PreparedLabelPhoto,
} from '../utils/labelPhoto';
import { labelCropPixels, type LabelCrop } from '../utils/labelCrop';
import { downscaleFoodPhoto } from '../utils/pickImage';
import {
  rememberLabelScan,
  type LabelScanSource,
} from '../services/labelScanSession';
import { labelScanToInitialFood } from '../utils/labelScanFood';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { useActiveAiServiceSetting } from '../hooks/useActiveAiServiceSetting';
import { isFoodPhotoAvailable } from '../services/api/aiSettingsApi';
import {
  hasSeenFoodPhotoIntro,
  markFoodPhotoIntroSeen,
} from '../services/foodPhotoIntro';
import { addLog } from '../services/LogService';
import { isFoodSelectionMode } from '../utils/foodPickerMode';

type FoodScanScreenProps = RootStackScreenProps<'FoodScan'>;

type ScanMode = 'barcode' | 'label' | 'photo';
type CapturedLabelPhoto =
  | { kind: 'camera'; uri: string; width: number; height: number }
  | ({ kind: 'prepared' } & PreparedLabelPhoto);

const SCAN_SEGMENTS: ScanMode[] = ['barcode', 'label', 'photo'];
const BARCODE_SCANNER_SETTINGS: BarcodeSettings = {
  barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'],
};

const GUIDE_WIDTH = 280;
const GUIDE_HEIGHT = 160;

const GUIDE_BOTTOM_MARGIN = 120;

const CORNER_SIZE = 24;
const CORNER_BORDER = 3;
const CORNER_STYLE = {
  position: 'absolute' as const,
  width: CORNER_SIZE,
  height: CORNER_SIZE,
  borderColor: '#fff',
};

const FoodScanScreen: React.FC<FoodScanScreenProps> = ({
  navigation,
  route,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const accentPrimary = String(useCSSVariable('--color-accent-primary'));
  const [permission, requestPermission] = useCameraPermissions();
  const soundsEnabled = useAppPreferencesStore((s) => s.soundsEnabled);
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [flashlight, setFlashlight] = useState(false);
  const isFocused = useIsFocused();
  const [appActive, setAppActive] = useState(
    () =>
      AppState.currentState !== 'background' &&
      AppState.currentState !== 'inactive'
  );
  const appActiveRef = useRef(appActive);
  const [cameraSession, setCameraSession] = useState(0);
  const cameraSessionRef = useRef(0);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [labelCapturing, setLabelCapturing] = useState(false);
  const barcodeRequestId = useRef(0);
  const barcodeAbortController = useRef<AbortController | null>(null);
  const lookupPending = useRef(false);
  const scanLock = useRef(false);
  const pickerLock = useRef(false);
  const labelRequestLock = useRef(false);
  const labelScanActive = useRef(true);
  const abortBarcodeRequest = useCallback(() => {
    barcodeRequestId.current += 1;
    barcodeAbortController.current?.abort();
    barcodeAbortController.current = null;
  }, []);
  useEffect(() => {
    labelScanActive.current = true;
    return () => {
      labelScanActive.current = false;
      abortBarcodeRequest();
    };
  }, [abortBarcodeRequest]);
  const params = route.params;
  const captureParams = params?.mode === 'capture-barcode' ? params : undefined;
  const labelCaptureParams =
    params?.mode === 'capture-label' ? params : undefined;
  const lookupParams =
    params?.mode === 'capture-barcode' || params?.mode === 'capture-label'
      ? undefined
      : params;
  const isCaptureBarcodeMode = !!captureParams;
  const isCaptureLabelMode = !!labelCaptureParams;
  const captureReturnKey = captureParams?.returnKey;
  const mealTypeId = lookupParams?.mealTypeId;
  const [scanMode, setScanMode] = useState<ScanMode>(() => {
    if (isCaptureLabelMode) return 'label';
    if (isCaptureBarcodeMode) {
      // Capture-only mode: lock to barcode regardless of any other params.
      return 'barcode';
    }
    const requested = lookupParams?.initialMode ?? 'barcode';
    // Picker scans never use the photo flow (it always logs to the
    // diary). Coerce to barcode if a caller deep-links 'photo' here.
    if (
      requested === 'photo' &&
      isFoodSelectionMode(lookupParams?.pickerMode)
    ) {
      return 'barcode';
    }
    return requested;
  });
  const [notFoundBarcode, setNotFoundBarcode] = useState<string | null>(null);
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<{
    barcode: string;
    message: string;
  } | null>(null);
  const [labelProcessing, setLabelProcessing] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<CapturedLabelPhoto | null>(
    null
  );
  const [labelCrop, setLabelCrop] = useState<LabelCrop>({
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  });
  const [manualEntryVisible, setManualEntryVisible] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [photoGateVisible, setPhotoGateVisible] = useState(false);
  const introCheckedRef = useRef(false);
  const cameraRef = useRef<CameraView>(null);
  const date = lookupParams?.date;
  const pickerMode = lookupParams?.pickerMode ?? 'log-entry';
  const returnDepth = lookupParams?.returnDepth;
  const providerId = lookupParams?.providerId;
  const isSelectionMode = isFoodSelectionMode(pickerMode);
  const selectionPickerMode = isSelectionMode ? pickerMode : undefined;
  const mealPlanTarget = lookupParams?.mealPlanTarget;

  const cancelBarcodeLookup = useCallback(() => {
    // Invalidate before unlocking so an abandoned request cannot affect a retry.
    abortBarcodeRequest();
    lookupPending.current = false;
    scanLock.current = false;
    setScanned(false);
    setLoading(false);
    setPendingBarcode(null);
  }, [abortBarcodeRequest]);

  const restartCamera = useCallback(() => {
    setCameraReady(false);
    cameraSessionRef.current += 1;
    setCameraSession(cameraSessionRef.current);
    setCameraFailed(false);
  }, []);

  const handleScanAgain = () => {
    cancelBarcodeLookup();
    setNotFoundBarcode(null);
    setLookupError(null);
    restartCamera();
  };

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const active = state === 'active';
      appActiveRef.current = active;
      if (!active) {
        cancelBarcodeLookup();
        restartCamera();
      }
      setAppActive(active);
    });
    return () => subscription.remove();
  }, [cancelBarcodeLookup, restartCamera]);

  useEffect(() => {
    if (!isFocused) {
      cancelBarcodeLookup();
      restartCamera();
    }
  }, [isFocused, cancelBarcodeLookup, restartCamera]);

  // Photo estimation always logs to the diary; hide it for meal-builder
  // scans so we don't drop the user into a flow that ignores pickerMode.
  // Same for basket-origin scans: the photo flow's success pop goes to the
  // diary root, which would unmount FoodSearchScreen and silently drop the
  // in-progress multi-select basket. capture-barcode mode is barcode-only.
  const isBasketOriginScan = pickerMode === 'log-entry' && returnDepth != null;
  const scanSegments = useMemo(() => {
    if (isCaptureLabelMode) {
      return [
        {
          key: 'label' as const,
          label: t('foodScan.segment.label', { defaultValue: 'Label' }),
        },
      ];
    }
    if (isCaptureBarcodeMode) {
      return SCAN_SEGMENTS.filter((key) => key === 'barcode').map((key) => ({
        key,
        label: t('foodScan.segment.barcode', { defaultValue: 'Barcode' }),
      }));
    }
    return (
      isSelectionMode || isBasketOriginScan
        ? SCAN_SEGMENTS.filter((key) => key !== 'photo')
        : SCAN_SEGMENTS
    ).map((key) => ({
      key,
      label:
        key === 'barcode'
          ? t('foodScan.segment.barcode', { defaultValue: 'Barcode' })
          : key === 'label'
            ? t('foodScan.segment.label', { defaultValue: 'Label' })
            : t('foodScan.segment.photo', { defaultValue: 'Photo' }),
    }));
  }, [
    isCaptureBarcodeMode,
    isCaptureLabelMode,
    isSelectionMode,
    isBasketOriginScan,
    t,
  ]);

  const aiSettingQuery = useActiveAiServiceSetting({
    // Skip the AI gating fetch in capture-barcode mode — Photo segment is
    // unreachable there.
    enabled: !isCaptureBarcodeMode && scanMode === 'photo',
    // Refresh on every photo-mode entry so a user who left to set up AI in
    // the web app sees the gate clear when they come back.
    staleTime: 0,
  });
  const aiSetting = aiSettingQuery.data ?? null;
  const photoModeAvailable = isFoodPhotoAvailable(aiSetting);
  const photoModeLoading = scanMode === 'photo' && aiSettingQuery.isLoading;

  const buildFoodFormParams = (
    extra: Partial<
      Extract<
        RootStackScreenProps<'FoodForm'>['route']['params'],
        { mode: 'create-food' }
      >
    >
  ): Extract<
    RootStackScreenProps<'FoodForm'>['route']['params'],
    { mode: 'create-food' }
  > => ({
    mode: 'create-food',
    date,
    mealTypeId: mealTypeId ?? undefined,
    pickerMode: selectionPickerMode,
    returnDepth,
    mealPlanTarget,
    ...extra,
  });

  const performBarcodeLookup = async (
    barcode: string,
    {
      shouldFireSuccessHaptic = false,
    }: { shouldFireSuccessHaptic?: boolean } = {}
  ) => {
    if (
      lookupPending.current ||
      !appActiveRef.current ||
      !labelScanActive.current ||
      !navigation.isFocused()
    )
      return;
    lookupPending.current = true;
    const controller = new AbortController();
    barcodeAbortController.current = controller;
    const requestId = ++barcodeRequestId.current;
    const isCurrentRequest = () =>
      labelScanActive.current &&
      appActiveRef.current &&
      navigation.isFocused() &&
      requestId === barcodeRequestId.current;
    setLoading(true);
    setPendingBarcode(barcode);
    setNotFoundBarcode(null);
    setLookupError(null);
    try {
      const [account, result] = await Promise.all([
        getActiveServerConfig(),
        lookupBarcodeV2(barcode, providerId, controller.signal),
      ]);
      const accountId = account?.id;
      const currentAccountId = (await getActiveServerConfig())?.id;
      if (!isCurrentRequest() || accountId !== currentAccountId) return;

      if (!result.food) {
        setNotFoundBarcode(barcode);
      } else {
        if (shouldFireSuccessHaptic) fireSuccessHaptic();
        const item = barcodeResultToFoodInfo(result, barcode);
        navigation.replace('FoodEntryAdd', {
          item,
          date,
          pickerMode: selectionPickerMode,
          returnDepth,
          mealTypeId,
          mealPlanTarget,
          barcodeLookup: {
            barcode,
            accountId,
            providerId:
              result.providerId ??
              (result.source === 'local' ? 'local' : undefined),
            providerName: result.providerName,
          },
        });
      }
    } catch (error) {
      if (!isCurrentRequest()) return;
      const message =
        error instanceof TimeoutError
          ? t('foodScan.errors.timeout', {
              defaultValue: 'Request timed out. Check your server connection.',
            })
          : (getApiErrorMessage(error) ??
            t('foodScan.errors.lookupBarcode', {
              defaultValue: "Couldn't look up this barcode. Please try again.",
            }));
      setLookupError({ barcode, message });
    } finally {
      if (isCurrentRequest()) {
        barcodeAbortController.current = null;
        lookupPending.current = false;
        setLoading(false);
      }
    }
  };

  const dispatchCapturedBarcode = (barcode: string) => {
    if (!captureReturnKey) return;
    navigation.dispatch({
      ...CommonActions.setParams({
        pendingScannedBarcode: barcode,
        scannedBarcodeNonce: Date.now(),
      }),
      source: captureReturnKey,
    });
    navigation.goBack();
  };

  const handleBarcodeScanned = async ({ data }: BarcodeScanningResult) => {
    if (
      scanLock.current ||
      !isFocused ||
      !appActiveRef.current ||
      !navigation.isFocused() ||
      cameraSession !== cameraSessionRef.current ||
      !data.trim()
    )
      return;
    scanLock.current = true;
    setScanned(true);
    if (isCaptureBarcodeMode) {
      fireSuccessHaptic();
      dispatchCapturedBarcode(data);
      return;
    }
    await performBarcodeLookup(data, { shouldFireSuccessHaptic: true });
  };

  const handleManualSubmit = async () => {
    const barcode = manualBarcode.trim();
    if (!barcode || lookupPending.current) return;
    if (
      !isCaptureBarcodeMode &&
      (!appActiveRef.current ||
        !labelScanActive.current ||
        !navigation.isFocused())
    )
      return;
    setManualEntryVisible(false);
    setManualBarcode('');
    scanLock.current = true;
    setScanned(true);
    if (isCaptureBarcodeMode) {
      dispatchCapturedBarcode(barcode);
      return;
    }
    await performBarcodeLookup(barcode);
  };

  const returnToLabelEditor = () => {
    if (
      !isCaptureLabelMode ||
      !labelScanActive.current ||
      !navigation.isFocused()
    )
      return;
    labelScanActive.current = false;
    navigation.goBack();
  };

  // Capture the camera already on screen. Crop in the review step before
  // downscaling so a small label keeps its detail without a second camera UI.
  const handleLabelCapture = async () => {
    if (!cameraRef.current || !cameraReady || pickerLock.current) return;
    pickerLock.current = true;
    setLabelCapturing(true);
    const session = cameraSessionRef.current;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: false,
        quality: 1,
        shutterSound: soundsEnabled,
      });
      if (
        !labelScanActive.current ||
        !navigation.isFocused() ||
        session !== cameraSessionRef.current
      )
        return;
      if (!photo?.uri || !photo.width || !photo.height)
        throw new Error('No label photo returned by camera');
      setLabelCrop({ x: 0, y: 0, width: 1, height: 1 });
      setCapturedPhoto({
        kind: 'camera',
        uri: photo.uri,
        width: photo.width,
        height: photo.height,
      });
    } catch (error) {
      if (
        !labelScanActive.current ||
        !navigation.isFocused() ||
        session !== cameraSessionRef.current
      )
        return;
      addLog(
        `[Food Scan] Label camera capture failed: ${error instanceof Error ? error.message : String(error)}`,
        'ERROR'
      );
      Toast.show({
        type: 'error',
        text1: t('common.error', { defaultValue: 'Error' }),
        text2: t('foodScan.errors.capturePhoto', {
          defaultValue: 'Failed to capture photo.',
        }),
      });
    } finally {
      pickerLock.current = false;
      setLabelCapturing(false);
    }
  };

  const handleLabelPickFromLibrary = async () => {
    if (pickerLock.current) return;
    pickerLock.current = true;
    try {
      // allowsEditing hands the user the system crop UI, which doubles as the
      // manual "select the label bounds" step for photos taken earlier.
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        quality: 0.85,
        base64: true,
        allowsMultipleSelection: false,
      });
      if (result.canceled) {
        returnToLabelEditor();
        return;
      }
      const asset = result.assets?.[0];
      if (!asset?.uri) {
        Toast.show({
          type: 'error',
          text1: t('common.error', { defaultValue: 'Error' }),
          text2: t('foodScan.errors.noPhoto', {
            defaultValue: 'No photo returned by picker.',
          }),
        });
        returnToLabelEditor();
        return;
      }
      const prepared = await prepareLabelPhoto(asset);
      if (!prepared) {
        Toast.show({
          type: 'error',
          text1: t('common.error', { defaultValue: 'Error' }),
          text2: t('foodScan.errors.processPhoto', {
            defaultValue: 'Failed to process photo.',
          }),
        });
        returnToLabelEditor();
        return;
      }
      setCapturedPhoto({ kind: 'prepared', ...prepared });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[Food Scan] Label pick from library failed: ${message}`, 'ERROR');
      const isLauncherError = message.includes(
        'unregistered ActivityResultLauncher'
      );
      Toast.show({
        type: 'error',
        text1: t('common.error', { defaultValue: 'Error' }),
        text2: isLauncherError
          ? t('foodScan.errors.restartApp', {
              defaultValue: 'Unable to open gallery. Please restart the app.',
            })
          : t('foodScan.errors.loadPhoto', {
              defaultValue: 'Failed to load photo.',
            }),
      });
      returnToLabelEditor();
    } finally {
      pickerLock.current = false;
    }
  };

  const handleUsePhoto = async () => {
    if (!capturedPhoto || labelRequestLock.current) return;
    labelRequestLock.current = true;
    setLabelProcessing(true);
    try {
      const photo =
        capturedPhoto.kind === 'prepared'
          ? capturedPhoto
          : await prepareLabelPhoto(
              capturedPhoto,
              LABEL_MAX_DIMENSION,
              labelCropPixels(labelCrop, capturedPhoto)
            );
      if (!photo) throw new Error('Failed to prepare label photo');
      if (!labelScanActive.current || !navigation.isFocused()) return;
      const onDeviceResult = await scanLabelOnDevice(photo.base64);
      const result =
        onDeviceResult ??
        (await scanNutritionLabel(photo.base64, 'image/jpeg'));
      if (!result || typeof result !== 'object' || Array.isArray(result)) {
        throw new Error('Invalid nutrition label result');
      }
      if (!labelScanActive.current || !navigation.isFocused()) return;
      if (labelCaptureParams) {
        navigation.dispatch({
          ...CommonActions.setParams({
            pendingNutritionLabelScan: { result, nonce: Date.now() },
          }),
          source: labelCaptureParams.returnKey,
        });
        navigation.goBack();
        return;
      }
      const source: LabelScanSource = onDeviceResult ? 'device' : 'server';
      rememberLabelScan(photo.base64, source);
      // The toast survives the navigation below, so it shows on the form. The
      // server reading is only news when the on-device scan was tried first;
      // otherwise it is the normal path and the form's banner says enough.
      const triedOnDevice =
        useAppPreferencesStore.getState().onDeviceLabelScanEnabled &&
        isOnDeviceLabelScanAvailable();
      if (onDeviceResult || triedOnDevice) {
        Toast.show({
          type: 'info',
          text1: onDeviceResult
            ? t('foodScan.labelReadOnDevice', {
                defaultValue: 'Label read on this iPhone',
              })
            : t('foodScan.labelReadByServer', {
                defaultValue: 'Label read by the server AI',
              }),
        });
      }
      navigation.replace(
        'FoodForm',
        buildFoodFormParams({
          initialFood: labelScanToInitialFood(result),
          barcode: lookupError?.barcode ?? notFoundBarcode ?? undefined,
          providerType: 'label_scan',
          labelScanSource: source,
        })
      );
    } catch {
      if (
        isCaptureLabelMode &&
        (!labelScanActive.current || !navigation.isFocused())
      )
        return;
      Toast.show({
        type: 'error',
        text1: t('common.error', { defaultValue: 'Error' }),
        text2: t('foodScan.errors.analyzeLabel', {
          defaultValue: 'Failed to analyze nutrition label. Please try again.',
        }),
      });
      returnToLabelEditor();
    } finally {
      labelRequestLock.current = false;
      setLabelProcessing(false);
    }
  };

  const handleRetake = () => {
    setCameraReady(false);
    setCapturedPhoto(null);
  };

  const handleSegmentChange = (key: ScanMode) => {
    // Re-tapping Photo while already on Photo is the user's "I configured
    // AI in the web app, try again" gesture — force a refetch so the gate
    // can clear without leaving the segment.
    if (key === 'photo' && scanMode === 'photo') {
      void aiSettingQuery.refetch();
      return;
    }
    setScanMode(key);
    cancelBarcodeLookup();
    restartCamera();
    setNotFoundBarcode(null);
    setLookupError(null);
    setCapturedPhoto(null);
    setScanned(false);
    scanLock.current = false;
    setManualEntryVisible(false);
    setManualBarcode('');
    if (key !== 'photo') {
      setPhotoGateVisible(false);
      introCheckedRef.current = false;
    }
  };

  // Photo-mode gate: drives the gate overlay and the one-time intro push.
  // Triggered via effect (not just segment change) so deep-link entries
  // with `initialMode: 'photo'` still hit the gate.
  useEffect(() => {
    if (isCaptureBarcodeMode) return;
    if (isBasketOriginScan) {
      // Basket-origin scans cannot use photo mode at all (its flow pops to
      // the diary root and would drop the basket): hide the gate, snap the
      // segment back to barcode, and never reach the availability fetch —
      // including deep-link photo entries the filtered segments can't stop.
      setPhotoGateVisible(false);
      setScanMode('barcode');
      return;
    }
    if (scanMode !== 'photo') return;
    if (aiSettingQuery.isLoading) return;

    if (!photoModeAvailable) {
      setPhotoGateVisible(true);
      return;
    }

    setPhotoGateVisible(false);
    if (introCheckedRef.current) return;
    introCheckedRef.current = true;
    void (async () => {
      const seen = await hasSeenFoodPhotoIntro();
      if (!seen) {
        navigation.navigate('FoodPhotoIntro', {
          date,
          mealTypeId: mealTypeId ?? undefined,
        });
      }
    })();
  }, [
    isCaptureBarcodeMode,
    scanMode,
    aiSettingQuery.isLoading,
    photoModeAvailable,
    isBasketOriginScan,
    navigation,
    date,
    mealTypeId,
  ]);

  const handlePhotoCapture = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: false,
        quality: 0.7,
        shutterSound: soundsEnabled,
      });
      if (!photo?.uri) {
        Toast.show({
          type: 'error',
          text1: t('common.error', { defaultValue: 'Error' }),
          text2: t('foodScan.errors.capturePhoto', {
            defaultValue: 'Failed to capture photo.',
          }),
        });
        return;
      }
      const prepared = await downscaleFoodPhoto(photo).catch(() => photo);
      // Mark seen even if user retakes — the intro shouldn't reappear later.
      await markFoodPhotoIntroSeen();
      navigation.replace('FoodPhotoFlow', {
        screen: 'Improve',
        params: {
          date,
          photo: { uri: prepared.uri },
          mealTypeId: mealTypeId ?? undefined,
        },
      });
    } catch {
      Toast.show({
        type: 'error',
        text1: t('common.error', { defaultValue: 'Error' }),
        text2: t('foodScan.errors.capturePhoto', {
          defaultValue: 'Failed to capture photo.',
        }),
      });
    }
  };

  const handlePhotoPickFromLibrary = async () => {
    // Guard against rapid double-taps re-entering the system picker.
    if (pickerLock.current) return;
    pickerLock.current = true;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        quality: 0.7,
        allowsMultipleSelection: false,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) {
        Toast.show({
          type: 'error',
          text1: t('common.error', { defaultValue: 'Error' }),
          text2: t('foodScan.errors.noPhoto', {
            defaultValue: 'No photo returned by picker.',
          }),
        });
        return;
      }
      const prepared = await downscaleFoodPhoto(asset).catch(() => asset);
      await markFoodPhotoIntroSeen();
      navigation.replace('FoodPhotoFlow', {
        screen: 'Improve',
        params: {
          date,
          photo: { uri: prepared.uri },
          mealTypeId: mealTypeId ?? undefined,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[Food Scan] Photo pick from library failed: ${message}`, 'ERROR');
      const isLauncherError = message.includes(
        'unregistered ActivityResultLauncher'
      );
      Toast.show({
        type: 'error',
        text1: t('common.error', { defaultValue: 'Error' }),
        text2: isLauncherError
          ? t('foodScan.errors.restartApp', {
              defaultValue: 'Unable to open gallery. Please restart the app.',
            })
          : t('foodScan.errors.loadPhoto', {
              defaultValue: 'Failed to load photo.',
            }),
      });
    } finally {
      pickerLock.current = false;
    }
  };

  const handleDismissPhotoGate = () => {
    setPhotoGateVisible(false);
    setScanMode('barcode');
  };

  const handlePhotoGateLogManually = () => {
    setPhotoGateVisible(false);
    navigation.replace('FoodSearch', { date });
  };

  const handleShowManualEntry = () => {
    scanLock.current = true;
    setManualEntryVisible(true);
    setScanned(true);
  };

  const handleDismissManualEntry = () => {
    setManualEntryVisible(false);
    setManualBarcode('');
    setScanned(false);
    scanLock.current = false;
    restartCamera();
  };

  const handleScanLabel = () => {
    setScanMode('label');
    cancelBarcodeLookup();
    restartCamera();
  };

  if (!permission) {
    return <View />;
  }

  return (
    <View className="flex-1 flex-col justify-center">
      {permission.granted &&
      isFocused &&
      appActive &&
      !cameraFailed &&
      !loading &&
      !(scanMode === 'barcode' && (notFoundBarcode || lookupError)) &&
      !manualEntryVisible &&
      !capturedPhoto &&
      !labelProcessing &&
      !photoGateVisible ? (
        <CameraView
          key={`${scanMode}-${cameraSession}`}
          ref={cameraRef}
          facing="back"
          autofocus="on"
          onCameraReady={() => {
            if (
              appActiveRef.current &&
              cameraSession === cameraSessionRef.current &&
              navigation.isFocused()
            )
              setCameraReady(true);
          }}
          onMountError={() => {
            if (
              appActiveRef.current &&
              cameraSession === cameraSessionRef.current &&
              navigation.isFocused()
            ) {
              setCameraReady(false);
              setCameraFailed(true);
            }
          }}
          onBarcodeScanned={
            scanMode === 'barcode' && !scanned
              ? handleBarcodeScanned
              : undefined
          }
          barcodeScannerSettings={
            scanMode === 'barcode' ? BARCODE_SCANNER_SETTINGS : undefined
          }
          style={StyleSheet.absoluteFill}
          enableTorch={flashlight}
        />
      ) : null}

      {!permission.granted &&
      !capturedPhoto &&
      !labelProcessing &&
      !loading &&
      !manualEntryVisible ? (
        <View
          className="items-center px-6"
          style={
            Platform.OS === 'android' ? { paddingTop: insets.top } : undefined
          }
        >
          <Text className="text-text-primary text-base text-center mb-4">
            {t('foodScan.permission.camera', {
              defaultValue: 'We need your permission to show the camera',
            })}
          </Text>
          <Button
            onPress={requestPermission}
            title={t('foodScan.permission.grant', {
              defaultValue: 'Grant Permission',
            })}
          />
        </View>
      ) : null}

      {permission.granted &&
      scanMode === 'barcode' &&
      !cameraFailed &&
      !notFoundBarcode &&
      !lookupError &&
      !loading &&
      !manualEntryVisible ? (
        <View
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          className="justify-center items-center"
        >
          <View
            style={{
              width: GUIDE_WIDTH,
              height: GUIDE_HEIGHT,
              marginBottom: GUIDE_BOTTOM_MARGIN,
            }}
          >
            <View
              style={{
                ...CORNER_STYLE,
                top: 0,
                left: 0,
                borderTopWidth: CORNER_BORDER,
                borderLeftWidth: CORNER_BORDER,
                borderTopLeftRadius: 4,
              }}
            />
            <View
              style={{
                ...CORNER_STYLE,
                top: 0,
                right: 0,
                borderTopWidth: CORNER_BORDER,
                borderRightWidth: CORNER_BORDER,
                borderTopRightRadius: 4,
              }}
            />
            <View
              style={{
                ...CORNER_STYLE,
                bottom: 0,
                left: 0,
                borderBottomWidth: CORNER_BORDER,
                borderLeftWidth: CORNER_BORDER,
                borderBottomLeftRadius: 4,
              }}
            />
            <View
              style={{
                ...CORNER_STYLE,
                bottom: 0,
                right: 0,
                borderBottomWidth: CORNER_BORDER,
                borderRightWidth: CORNER_BORDER,
                borderBottomRightRadius: 4,
              }}
            />
          </View>
        </View>
      ) : null}

      <View
        className="absolute left-4 right-4 flex-row justify-between items-center"
        style={{ top: Platform.OS === 'android' ? insets.top + 8 : 16 }}
      >
        <TouchableOpacity
          onPress={() => {
            labelScanActive.current = false;
            navigation.goBack();
          }}
          accessibilityRole="button"
          accessibilityLabel={t('foodScan.accessibility.back', {
            defaultValue: 'Go back',
          })}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="bg-black/50 rounded-full p-2"
        >
          <Icon name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        {permission.granted &&
        scanMode === 'barcode' &&
        !cameraFailed &&
        !loading &&
        !notFoundBarcode &&
        !lookupError &&
        !manualEntryVisible ? (
          <TouchableOpacity
            onPress={handleScanAgain}
            accessibilityRole="button"
            className="bg-black/50 rounded-full px-4 py-2"
          >
            <Text className="text-white text-sm font-semibold">
              {t('foodScan.barcode.restartCamera', {
                defaultValue: 'Restart camera',
              })}
            </Text>
          </TouchableOpacity>
        ) : null}
        {permission.granted ? (
          <TouchableOpacity
            onPress={() => setFlashlight(!flashlight)}
            accessibilityRole="button"
            accessibilityLabel={
              flashlight
                ? t('foodScan.accessibility.flashlightOff', {
                    defaultValue: 'Turn flashlight off',
                  })
                : t('foodScan.accessibility.flashlightOn', {
                    defaultValue: 'Turn flashlight on',
                  })
            }
            className="bg-black/50 rounded-full p-2"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon
              name={flashlight ? 'flashlight-on' : 'flashlight-off'}
              size={22}
              color={flashlight ? accentPrimary : '#fff'}
            />
          </TouchableOpacity>
        ) : null}
      </View>

      {loading || labelProcessing ? (
        <View className="absolute inset-0 justify-center items-center bg-black/80">
          <ActivityIndicator size="large" color="#fff" />
          {loading ? (
            <>
              <Text className="text-white text-base mt-3">
                {t('foodScan.lookup.searching', {
                  defaultValue: 'Looking up barcode…',
                })}
              </Text>
              <Text className="text-white text-base mt-2">
                {pendingBarcode}
              </Text>
              <UIButton
                variant="outline"
                className="mt-4 bg-surface rounded-lg"
                onPress={handleScanAgain}
              >
                {t('foodScan.barcode.scanAgain', {
                  defaultValue: 'Scan again',
                })}
              </UIButton>
            </>
          ) : null}
          {labelProcessing ? (
            <Text className="text-white text-base mt-3">
              {t('foodScan.label.analyzing', {
                defaultValue: 'Analyzing label...',
              })}
            </Text>
          ) : null}
        </View>
      ) : null}

      {cameraFailed &&
      !loading &&
      !notFoundBarcode &&
      !lookupError &&
      !manualEntryVisible ? (
        <View className="absolute left-6 right-6 bg-surface rounded-xl p-5 items-center gap-3">
          <Text className="text-text-primary text-base font-semibold">
            {t('foodScan.camera.unavailable', {
              defaultValue: 'Camera unavailable',
            })}
          </Text>
          <Text className="text-text-secondary text-sm text-center">
            {t('foodScan.camera.restartHelp', {
              defaultValue: 'Restart the camera to try again.',
            })}
          </Text>
          <UIButton
            variant="primary"
            className="self-stretch rounded-lg"
            onPress={handleScanAgain}
          >
            {t('foodScan.barcode.restartCamera', {
              defaultValue: 'Restart camera',
            })}
          </UIButton>
        </View>
      ) : null}

      {capturedPhoto && !labelProcessing ? (
        <View className="absolute inset-0 bg-black">
          {capturedPhoto.kind === 'camera' ? (
            <View
              className="flex-1"
              style={{
                paddingTop: insets.top + 16,
                paddingBottom: insets.bottom + 136,
              }}
            >
              <Text className="text-white text-sm text-center px-6">
                {t('foodScan.label.cropHelp', {
                  defaultValue:
                    'Drag the corners to frame the nutrition label.',
                })}
              </Text>
              <LabelPhotoCropper
                photo={capturedPhoto}
                crop={labelCrop}
                onCropChange={setLabelCrop}
              />
            </View>
          ) : (
            <Image
              source={{ uri: capturedPhoto.uri }}
              style={StyleSheet.absoluteFill}
              resizeMode="contain"
            />
          )}
          <View
            className="absolute bottom-12 left-4 right-4 flex-row gap-3"
            style={{ paddingBottom: insets.bottom }}
          >
            <TouchableOpacity
              onPress={handleRetake}
              accessibilityRole="button"
              accessibilityLabel={t('foodScan.accessibility.retakePhoto', {
                defaultValue: 'Retake photo',
              })}
              className="flex-1 bg-white/20 py-4 rounded-lg items-center"
            >
              <Text className="text-white font-semibold text-base">
                {t('foodScan.label.retake', { defaultValue: 'Retake' })}
              </Text>
            </TouchableOpacity>
            <UIButton
              variant="primary"
              onPress={() => {
                void handleUsePhoto();
              }}
              className="flex-1 py-4 rounded-lg"
            >
              {t('foodScan.label.usePhoto', { defaultValue: 'Use Photo' })}
            </UIButton>
          </View>
        </View>
      ) : null}

      {!isCaptureBarcodeMode &&
      !capturedPhoto &&
      !labelProcessing &&
      !loading &&
      !manualEntryVisible &&
      scanMode === 'barcode' &&
      (notFoundBarcode || lookupError) ? (
        <View
          className="absolute left-0 right-0 items-center px-8"
          style={{
            bottom: Math.max(insets.bottom + 8, 24) + 76,
            maxHeight: '75%',
          }}
        >
          <ScrollView
            className="self-stretch bg-surface rounded-xl"
            contentContainerClassName="p-5 items-center gap-3"
            bounces={false}
          >
            <Text className="text-text-primary text-base font-semibold">
              {lookupError
                ? t('foodScan.lookup.failed', { defaultValue: 'Lookup failed' })
                : t('foodScan.lookup.noMatch', {
                    defaultValue: 'No match for barcode',
                  })}
            </Text>
            <Text className="text-text-secondary text-sm text-center">
              {lookupError
                ? lookupError.message
                : t('foodScan.lookup.nextSteps', {
                    defaultValue:
                      'Try scanning again, scan the nutrition label, or enter the food manually.',
                  })}
            </Text>
            <Text
              className="text-text-primary text-base font-semibold"
              selectable
            >
              {lookupError?.barcode ?? notFoundBarcode}
            </Text>
            <View className="gap-3 mt-2 self-stretch">
              <UIButton
                variant="primary"
                onPress={handleScanAgain}
                className="rounded-lg"
              >
                {t('foodScan.barcode.scanAgain', {
                  defaultValue: 'Scan again',
                })}
              </UIButton>
              {lookupError ? (
                <UIButton
                  variant="outline"
                  onPress={() => {
                    void performBarcodeLookup(lookupError.barcode);
                  }}
                  className="rounded-lg"
                >
                  {t('foodScan.lookup.retry', { defaultValue: 'Retry lookup' })}
                </UIButton>
              ) : null}
              <UIButton
                variant="outline"
                onPress={handleScanLabel}
                className="rounded-lg"
                textClassName="text-sm"
              >
                {t('foodScan.lookup.scanLabel', {
                  defaultValue: 'Scan Nutrition Label',
                })}
              </UIButton>
              <UIButton
                variant="outline"
                onPress={() =>
                  navigation.replace(
                    'FoodForm',
                    buildFoodFormParams({
                      barcode:
                        lookupError?.barcode ?? notFoundBarcode ?? undefined,
                    })
                  )
                }
                className="rounded-lg"
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: accentPrimary,
                  }}
                >
                  {t('foodScan.lookup.addManually', {
                    defaultValue: 'Add Food Manually',
                  })}
                </Text>
              </UIButton>
            </View>
          </ScrollView>
        </View>
      ) : null}

      {permission.granted &&
      scanMode === 'photo' &&
      !capturedPhoto &&
      !loading &&
      !manualEntryVisible &&
      !photoGateVisible &&
      photoModeAvailable ? (
        <View
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          className="justify-center items-center"
        >
          <View
            style={{
              width: GUIDE_WIDTH,
              height: GUIDE_WIDTH,
              marginBottom: 120,
              borderWidth: 2,
              borderColor: 'rgba(255,255,255,0.85)',
              borderRadius: 12,
            }}
          />
          <Text
            className="text-white text-sm mt-3"
            style={{ position: 'absolute', bottom: 220 }}
          >
            {t('foodScan.photo.frameMeal', {
              defaultValue: 'Frame the whole meal',
            })}
          </Text>
        </View>
      ) : null}

      {photoGateVisible ? (
        <View
          className="absolute left-0 right-0 items-center px-6"
          style={{ bottom: Math.max(insets.bottom + 8, 24) + 76 }}
        >
          <View className="self-stretch bg-surface rounded-xl p-5 gap-3">
            <Text className="text-text-primary text-base font-semibold">
              {t('foodScan.photo.notSetUp', {
                defaultValue: "AI photo estimates aren't set up",
              })}
            </Text>
            <Text className="text-text-secondary text-sm">
              {t('foodScan.photo.setupHelp', {
                defaultValue:
                  'Open SparkyFitness in a browser and visit Settings → AI to add an AI provider, then return here.',
              })}
            </Text>
            <View className="gap-2 mt-2">
              <UIButton
                variant="primary"
                onPress={handlePhotoGateLogManually}
                className="rounded-lg"
                textClassName="text-sm"
              >
                {t('foodScan.photo.logManually', {
                  defaultValue: 'Log manually',
                })}
              </UIButton>
              <UIButton
                variant="ghost"
                onPress={handleDismissPhotoGate}
                className="rounded-lg"
                textClassName="text-sm"
              >
                {t('common.later', { defaultValue: 'Later' })}
              </UIButton>
            </View>
          </View>
        </View>
      ) : null}

      {!capturedPhoto && !labelProcessing && !loading && !manualEntryVisible ? (
        <View
          className="absolute bottom-0 left-0 right-0 items-center gap-4"
          style={{ paddingBottom: Math.max(insets.bottom + 8, 24) }}
        >
          <View className="bg-black/50 rounded-lg mx-8 self-stretch">
            <SegmentedControl
              segments={scanSegments}
              activeKey={scanMode}
              onSelect={handleSegmentChange}
            />
          </View>

          {!(scanMode === 'barcode' && (notFoundBarcode || lookupError)) &&
          !(scanMode === 'photo' && photoGateVisible) ? (
            <View className="h-20 items-center justify-center self-stretch">
              {scanMode === 'barcode' ? (
                <TouchableOpacity
                  onPress={handleShowManualEntry}
                  accessibilityRole="button"
                  accessibilityLabel={t('foodScan.barcode.typeInstead', {
                    defaultValue: 'Type Barcode Instead',
                  })}
                  className="bg-raised px-6 py-3 rounded-xl"
                >
                  <Text className="text-text-primary text-sm font-semibold">
                    {t('foodScan.barcode.typeInstead', {
                      defaultValue: 'Type Barcode Instead',
                    })}
                  </Text>
                </TouchableOpacity>
              ) : null}

              {scanMode === 'label' ? (
                <>
                  <TouchableOpacity
                    onPress={() => {
                      void handleLabelCapture();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t(
                      'foodScan.accessibility.takeLabelPhoto',
                      { defaultValue: 'Take nutrition label photo' }
                    )}
                    disabled={
                      !permission.granted || !cameraReady || labelCapturing
                    }
                    className={`w-20 h-20 rounded-full border-4 border-white items-center justify-center ${permission.granted && cameraReady && !labelCapturing ? '' : 'opacity-40'}`}
                    activeOpacity={0.7}
                  >
                    {labelCapturing ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <View className="w-16 h-16 rounded-full bg-white" />
                    )}
                  </TouchableOpacity>
                  {/* Same placement as photo mode's library button. */}
                  <TouchableOpacity
                    onPress={() => {
                      void handleLabelPickFromLibrary();
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityLabel={t(
                      'foodScan.accessibility.chooseLabelPhoto',
                      { defaultValue: 'Choose label photo from library' }
                    )}
                    accessibilityRole="button"
                    disabled={labelCapturing}
                    className="bg-black/50 rounded-full items-center justify-center"
                    style={{
                      position: 'absolute',
                      left: '25%',
                      top: 18,
                      width: 44,
                      height: 44,
                      transform: [{ translateX: -26 }],
                    }}
                  >
                    <Icon name="photo-library" size={26} color="#fff" />
                  </TouchableOpacity>
                </>
              ) : null}

              {scanMode === 'photo' ? (
                <>
                  {photoModeLoading ? (
                    <ActivityIndicator size="large" color="#fff" />
                  ) : (
                    <TouchableOpacity
                      onPress={() => {
                        void handlePhotoCapture();
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={t(
                        'foodScan.accessibility.takeMealPhoto',
                        { defaultValue: 'Take meal photo' }
                      )}
                      disabled={!permission.granted || !photoModeAvailable}
                      className={`w-20 h-20 rounded-full border-4 border-white items-center justify-center ${permission.granted && photoModeAvailable ? '' : 'opacity-40'}`}
                      activeOpacity={0.7}
                    >
                      <View className="w-16 h-16 rounded-full bg-white" />
                    </TouchableOpacity>
                  )}
                  {/* Centered between the capture button and the segmented control's left edge. */}
                  {photoModeAvailable && !photoModeLoading ? (
                    <TouchableOpacity
                      onPress={() => {
                        void handlePhotoPickFromLibrary();
                      }}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityLabel={t(
                        'foodScan.accessibility.choosePhoto',
                        { defaultValue: 'Choose photo from library' }
                      )}
                      accessibilityRole="button"
                      className="bg-black/50 rounded-full items-center justify-center"
                      style={{
                        position: 'absolute',
                        left: '25%',
                        top: 18,
                        width: 44,
                        height: 44,
                        transform: [{ translateX: -26 }],
                      }}
                    >
                      <Icon name="photo-library" size={26} color="#fff" />
                    </TouchableOpacity>
                  ) : null}
                  {/* Centered between the capture button and the segmented control's right edge. */}
                  <TouchableOpacity
                    onPress={() =>
                      navigation.navigate('FoodPhotoIntro', {
                        date,
                        mealTypeId: mealTypeId ?? undefined,
                      })
                    }
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityLabel={t('foodScan.accessibility.howItWorks', {
                      defaultValue: 'How photo estimation works',
                    })}
                    accessibilityRole="button"
                    className="bg-black/50 rounded-full items-center justify-center"
                    style={{
                      position: 'absolute',
                      right: '25%',
                      top: 18,
                      width: 44,
                      height: 44,
                      transform: [{ translateX: 26 }],
                    }}
                  >
                    <Icon name="help-circle" size={28} color="#fff" />
                  </TouchableOpacity>
                </>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      <Modal
        visible={manualEntryVisible}
        transparent
        animationType="fade"
        onRequestClose={handleDismissManualEntry}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <ScrollView
            contentContainerClassName="justify-center items-center p-6"
            contentContainerStyle={{ flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
            bounces={false}
          >
            <View className="w-full max-w-90 rounded-2xl p-6 bg-surface shadow-sm gap-4">
              <Text className="text-text-primary text-base font-semibold text-center">
                {t('foodScan.manual.title', { defaultValue: 'Enter Barcode' })}
              </Text>
              <FormInput
                placeholder={t('foodScan.manual.placeholder', {
                  defaultValue: 'Barcode number',
                })}
                keyboardType="number-pad"
                autoFocus
                value={manualBarcode}
                onChangeText={setManualBarcode}
                onSubmitEditing={() => {
                  void handleManualSubmit();
                }}
                style={{ textAlign: 'center' }}
              />
              <View className="flex-row gap-3">
                <UIButton
                  variant="ghost"
                  onPress={handleDismissManualEntry}
                  className="flex-1 py-3 rounded-lg"
                  textClassName="text-sm"
                >
                  {t('common.cancel', { defaultValue: 'Cancel' })}
                </UIButton>
                <UIButton
                  variant="primary"
                  disabled={!manualBarcode.trim()}
                  onPress={() => {
                    void handleManualSubmit();
                  }}
                  className="flex-1 py-3 rounded-lg"
                  textClassName="text-sm"
                >
                  {isCaptureBarcodeMode
                    ? t('foodScan.manual.useBarcode', {
                        defaultValue: 'Use Barcode',
                      })
                    : t('foodScan.manual.lookup', { defaultValue: 'Look Up' })}
                </UIButton>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

export default FoodScanScreen;
