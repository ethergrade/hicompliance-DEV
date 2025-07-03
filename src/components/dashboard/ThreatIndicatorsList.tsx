import React from 'react';

export const ThreatIndicatorsList: React.FC = () => {
  const threats = [
    { name: 'Malware', color: 'text-red-500' },
    { name: 'Abnormal Admin Activity', color: 'text-red-500' },
    { name: 'Suspected Bot Attacks', color: 'text-red-500' },
    { name: 'Access Permissions Violation', color: 'text-red-500' },
    { name: 'Mass Download', color: 'text-red-500' },
  ];

  return (
    <div className="mt-6 space-y-2">
      <h5 className="font-medium text-sm">Minacce Rilevate (Ultimi 90 giorni)</h5>
      {threats.map((threat, index) => (
        <div key={index} className="flex items-center space-x-2 text-sm">
          <div className="w-2 h-2 rounded-full bg-red-500"></div>
          <span className={threat.color}>{threat.name}</span>
        </div>
      ))}
    </div>
  );
};