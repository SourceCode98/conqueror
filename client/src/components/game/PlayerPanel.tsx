import { useTranslation } from 'react-i18next';
import type { PublicPlayerState } from '@conqueror/shared';
import { ALL_RESOURCES } from '@conqueror/shared';
import { useGameStore } from '../../store/gameStore.js';
import { PLAYER_COLOR_HEX } from '../HexBoard/hexLayout.js';
import { RESOURCE_ICON_MAP, DevCardIcon, BanditIcon, RoadIcon, SettlementIcon } from '../icons/GameIcons.js';

interface Props {
  player: PublicPlayerState;
  isActive: boolean;
}

export default function PlayerPanel({ player, isActive }: Props) {
  const { t } = useTranslation('game');
  const { localPlayerId } = useGameStore();
  const isMe = player.id === localPlayerId;
  const color = PLAYER_COLOR_HEX[player.color] ?? '#888';
  const totalCards = ALL_RESOURCES.reduce((s, r) => s + player.resources[r], 0);

  return (
    <div
      className={`rounded-lg p-2 text-sm border transition-all ${
        isActive
          ? 'border-amber-400 bg-gray-700 shadow-sm'
          : 'border-gray-700 bg-gray-800'
      } ${!player.connected ? 'opacity-50' : ''}`}
      style={{ borderLeftColor: color, borderLeftWidth: 3 }}
    >
      {/* Player name + VP */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-semibold truncate" style={{ color }}>
          {player.username}
          {isMe && <span className="text-xs text-gray-400 ml-1">(you)</span>}
        </span>
        <span className="text-amber-400 font-bold text-xs tabular-nums shrink-0">
          {player.victoryPoints} VP
        </span>
      </div>

      {/* Resources — full breakdown for self, card count for others */}
      {isMe ? (
        <div className="grid grid-cols-5 gap-0.5 mb-1.5">
          {ALL_RESOURCES.map(r => (
            <div key={r} className="flex flex-col items-center" title={t(`resources.${r}`)}>
              {RESOURCE_ICON_MAP[r]?.({ size: 18 })}
              <span className="text-xs text-gray-200 tabular-nums font-medium">{player.resources[r]}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 mb-1.5 text-xs text-gray-400">
          <span className="inline-block size-2 rounded-full bg-gray-500"/>
          <span className="tabular-nums">{totalCards} resource{totalCards !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Public info: knights, special cards, pieces left */}
      <div className="flex flex-wrap gap-1 mb-1">
        {/* Knights played — always public */}
        {player.knightsPlayed > 0 && (
          <span className="flex items-center gap-0.5 bg-gray-700 rounded px-1 py-0.5 text-xs">
            <BanditIcon size={10} color="#f97316"/>
            <span className="tabular-nums text-orange-300">{player.knightsPlayed}</span>
          </span>
        )}
        {player.hasSupremeArmy && (
          <span className="bg-red-900 text-red-200 text-xs px-1 rounded border border-red-700">
            ⚔️ {t('specialCards.supremeArmy')}
          </span>
        )}
        {player.hasGrandRoad && (
          <span className="bg-yellow-900 text-yellow-200 text-xs px-1 rounded border border-yellow-700">
            🛣 {t('specialCards.grandRoad')}
          </span>
        )}
      </div>

      {/* Dev cards count + connection */}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <DevCardIcon size={12} color="#f59e0b"/>
          <span className="tabular-nums">{player.devCardCount}</span>
        </span>
        <div className="flex items-center gap-1.5">
          {/* Pieces remaining */}
          <span className="flex items-center gap-0.5" title="Roads left">
            <RoadIcon size={10} color={color}/>
            <span className="tabular-nums">{player.roadsLeft}</span>
          </span>
          <span className="flex items-center gap-0.5" title="Settlements left">
            <SettlementIcon size={10} color={color}/>
            <span className="tabular-nums">{player.settlementsLeft}</span>
          </span>
          <span
            className="relative flex items-center justify-center size-2.5"
            title={player.connected ? 'Online' : 'Offline'}
          >
            {player.connected ? (
              <>
                <span className="absolute inline-flex size-full rounded-full bg-green-400 opacity-50 animate-ping" />
                <span className="relative inline-flex size-1.5 rounded-full bg-green-400" />
              </>
            ) : (
              <span className="relative inline-flex size-2 rounded-full bg-red-500" />
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
