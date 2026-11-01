import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';

import AddMenuIconTile, { useAddMenuTintColors } from './AddMenuIconTile';
import Icon from './Icon';
import {
  ADD_MENU_CARD_LABELS,
  ADD_MENU_ITEM_ICONS,
  ADD_MENU_ITEM_TINTS,
  type AddMenuItemKey,
  type AddMenuRowStyle,
} from '../constants/addMenuItems';
import { useAddMenuItemAvailable } from '../hooks/useAddMenuItemAvailable';
import { useAddMenuItemLabel } from '../hooks/useAddMenuItemLabel';
import { chunkIntoLines } from '../utils/addMenu';

interface AddMenuPreviewProps {
  cards: readonly AddMenuItemKey[];
  /** The items to show, split by style and in the order the sheet shows them. */
  groups: Record<AddMenuRowStyle, AddMenuItemKey[]>;
}

/**
 * A small picture of the Quick Actions sheet as it is arranged now, so what
 * shares a line is visible while the arrangement is being changed.
 */
const AddMenuPreview: React.FC<AddMenuPreviewProps> = ({ cards, groups }) => {
  const { t } = useTranslation();
  const tintColors = useAddMenuTintColors();
  const labelFor = useAddMenuItemLabel();
  const isAvailable = useAddMenuItemAvailable();
  const shown = {
    list: groups.list.filter(isAvailable),
    compact: groups.compact.filter(isAvailable),
    action: groups.action.filter(isAvailable),
  };
  const [surfaceBg, raisedBg, borderSubtle, textMuted] = useCSSVariable([
    '--color-surface',
    '--color-raised',
    '--color-border-subtle',
    '--color-text-muted',
  ]) as string[];

  const hairline = (key: string) => (
    <View
      key={key}
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: borderSubtle,
      }}
    />
  );

  const item = (key: AddMenuItemKey, withChevron = false) => (
    <View
      key={key}
      className="flex-1 flex-row items-center px-3 py-2.5"
      style={{ minWidth: 0 }}
    >
      <Icon
        name={ADD_MENU_ITEM_ICONS[key]}
        size={16}
        color={tintColors[ADD_MENU_ITEM_TINTS[key]]}
      />
      <Text
        className="flex-1 text-text-primary text-xs font-medium ml-2"
        numberOfLines={1}
      >
        {labelFor(key)}
      </Text>
      {withChevron ? (
        <Icon name="chevron-forward" size={10} color={textMuted} />
      ) : null}
    </View>
  );

  const panelLines = [
    ...shown.list.map((key) => (
      <View key={key} className="flex-row">
        {item(key, true)}
      </View>
    )),
    ...chunkIntoLines(shown.compact).map((keys, index) => (
      <View key={`pair-${index}`} className="flex-row">
        {keys.flatMap((key, position) =>
          position === 0
            ? [item(key)]
            : [
                <View
                  key={`divider-${key}`}
                  style={{
                    width: StyleSheet.hairlineWidth,
                    backgroundColor: borderSubtle,
                  }}
                />,
                item(key),
              ]
        )}
      </View>
    )),
  ];

  return (
    <View
      testID="add-menu-preview"
      className="rounded-2xl p-2.5"
      style={{ backgroundColor: surfaceBg }}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <View
        className="flex-row rounded-xl py-2"
        style={{ backgroundColor: raisedBg }}
      >
        {cards.map((key) =>
          // An unavailable tile leaves its slot empty, as in the sheet.
          !isAvailable(key) ? (
            <View key={key} className="flex-1" />
          ) : (
            <View key={key} className="flex-1 items-center">
              <AddMenuIconTile
                icon={ADD_MENU_ITEM_ICONS[key]}
                color={tintColors[ADD_MENU_ITEM_TINTS[key]]}
                size="row"
              />
              <Text
                className="text-text-primary text-xs mt-1"
                numberOfLines={1}
              >
                {ADD_MENU_CARD_LABELS[key]?.(t) ?? labelFor(key)}
              </Text>
            </View>
          )
        )}
      </View>
      {panelLines.length > 0 ? (
        <View
          className="rounded-xl mt-2 overflow-hidden"
          style={{ backgroundColor: raisedBg }}
        >
          {panelLines.flatMap((line, index) =>
            index === 0 ? [line] : [hairline(`line-${index}`), line]
          )}
        </View>
      ) : null}
      {chunkIntoLines(shown.action).map((keys, index) => (
        <View key={`buttons-${index}`} className="flex-row mt-2">
          {keys.map((key, position) => (
            <View
              key={key}
              className="flex-1 rounded-xl"
              style={{
                backgroundColor: raisedBg,
                marginLeft: position === 0 ? 0 : 8,
              }}
            >
              {item(key)}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
};

export default AddMenuPreview;
