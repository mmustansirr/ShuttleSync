'use client';

import { Team, Match } from '../lib/db';
import { calculateStandings } from '../lib/tournamentUtils';
import styles from './StandingsTable.module.css';

interface StandingsTableProps {
  teams: Team[];
  matches: Match[];
  advancingCount?: number;
}

export default function StandingsTable({ teams, matches, advancingCount = 2 }: StandingsTableProps) {
  const standings = calculateStandings(teams, matches);

  return (
    <div className={styles.tableWrapper}>
      <table className="custom-table">
        <thead>
          <tr>
            <th style={{ width: '40px', textAlign: 'center' }}>Pos</th>
            <th>Team</th>
            <th style={{ textAlign: 'center' }}>P</th>
            <th style={{ textAlign: 'center' }}>W</th>
            <th style={{ textAlign: 'center' }}>L</th>
            <th style={{ textAlign: 'center' }}>Sets</th>
            <th style={{ textAlign: 'center' }}>Points Diff</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row, index) => {
            const isAdvancing = index < advancingCount;
            return (
              <tr 
                key={row.teamId}
                className={`${isAdvancing ? styles.advancingRow : ''}`}
              >
                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>
                  <span className={`${styles.positionBadge} ${isAdvancing ? styles.advancingBadge : ''}`}>
                    {index + 1}
                  </span>
                </td>
                <td className={styles.teamNameCell}>
                  <span className={styles.teamName}>{row.teamName}</span>
                </td>
                <td style={{ textAlign: 'center' }}>{row.played}</td>
                <td style={{ textAlign: 'center', color: 'var(--primary)', fontWeight: '600' }}>{row.wins}</td>
                <td style={{ textAlign: 'center', color: 'var(--danger)' }}>{row.losses}</td>
                <td style={{ textAlign: 'center', fontSize: '0.85rem' }}>
                  {row.setsWon}-{row.setsLost}
                  <span className={row.setDiff >= 0 ? styles.positiveDiff : styles.negativeDiff}>
                    ({row.setDiff >= 0 ? `+${row.setDiff}` : row.setDiff})
                  </span>
                </td>
                <td style={{ textAlign: 'center', fontSize: '0.85rem' }}>
                  <span className={row.pointDiff >= 0 ? styles.positiveDiff : styles.negativeDiff}>
                    {row.pointDiff >= 0 ? `+${row.pointDiff}` : row.pointDiff}
                  </span>
                </td>
              </tr>
            );
          })}
          {standings.length === 0 && (
            <tr>
              <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                No standings data available yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
