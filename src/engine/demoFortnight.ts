import { FortnightPeriod } from '../types/payroll';
import { createEmptyFortnight, getMondayOfWeek } from './timeUtils';

export function createDemoTestFortnight(startDate: string = getMondayOfWeek()): FortnightPeriod {
  const fortnight = createEmptyFortnight(startDate);

  // Test Case 1 (Week 1 Mon): Broken Shift + Afternoon Penalty
  // 09:00-11:30 (2.5h @ 100%) and 17:30-20:30 (3.0h @ 112.5%) + $18.34 Broken Shift Allowance
  fortnight.days[0].workBlocks = [
    {
      id: 'demo-tc1-a',
      blockType: 'REGULAR_CLIENT',
      startTime: '09:00',
      endTime: '11:30',
      unpaidMealBreakMinutes: 0,
      paidClientMealMinutes: 0,
      hasClinicalAssistance: false,
      isRecallOvertime: false,
      remoteContext: 'NOT_ON_CALL',
      rosteredHours: 0,
    },
    {
      id: 'demo-tc1-b',
      blockType: 'REGULAR_CLIENT',
      startTime: '17:30',
      endTime: '20:30',
      unpaidMealBreakMinutes: 0,
      paidClientMealMinutes: 0,
      hasClinicalAssistance: false,
      isRecallOvertime: false,
      remoteContext: 'NOT_ON_CALL',
      rosteredHours: 0,
    },
  ];

  // Test Case 2 (Week 1 Tue): Broken Shift >12h Span
  // 07:00-09:00 (2h @ 100%) and 18:00-20:30 -> 18:00-19:00 (1h @ 112.5%), 19:00-20:30 (1.5h @ 200%) + $18.34
  fortnight.days[1].workBlocks = [
    {
      id: 'demo-tc2-a',
      blockType: 'REGULAR_CLIENT',
      startTime: '07:00',
      endTime: '09:00',
      unpaidMealBreakMinutes: 0,
      paidClientMealMinutes: 0,
      hasClinicalAssistance: false,
      isRecallOvertime: false,
      remoteContext: 'NOT_ON_CALL',
      rosteredHours: 0,
    },
    {
      id: 'demo-tc2-b',
      blockType: 'REGULAR_CLIENT',
      startTime: '18:00',
      endTime: '20:30',
      unpaidMealBreakMinutes: 0,
      paidClientMealMinutes: 0,
      hasClinicalAssistance: false,
      isRecallOvertime: false,
      remoteContext: 'NOT_ON_CALL',
      rosteredHours: 0,
    },
  ];

  // Test Case 4 (Week 1 Thu): Daily Overtime + Travel Exemption
  // 07:00-17:30 (30m unpaid break = 10h client) + 17:30-18:00 (0.5h travel) + 18:00-19:30 (1.5h client OT @ 150% + $14.10 meal)
  fortnight.days[3].interClientKms = 18;
  fortnight.days[3].workBlocks = [
    {
      id: 'demo-tc4-a',
      blockType: 'REGULAR_CLIENT',
      startTime: '07:00',
      endTime: '17:30',
      unpaidMealBreakMinutes: 30,
      paidClientMealMinutes: 0,
      hasClinicalAssistance: false,
      isRecallOvertime: false,
      remoteContext: 'NOT_ON_CALL',
      rosteredHours: 0,
    },
    {
      id: 'demo-tc4-b',
      blockType: 'TRAVEL_BETWEEN_CLIENTS',
      startTime: '17:30',
      endTime: '18:00',
      unpaidMealBreakMinutes: 0,
      paidClientMealMinutes: 0,
      hasClinicalAssistance: false,
      isRecallOvertime: false,
      remoteContext: 'NOT_ON_CALL',
      rosteredHours: 0,
    },
    {
      id: 'demo-tc4-c',
      blockType: 'REGULAR_CLIENT',
      startTime: '18:00',
      endTime: '19:30',
      unpaidMealBreakMinutes: 0,
      paidClientMealMinutes: 0,
      hasClinicalAssistance: false,
      isRecallOvertime: false,
      remoteContext: 'NOT_ON_CALL',
      rosteredHours: 0,
    },
  ];

  // Test Case 3 (Week 2 Tue -> Wed): 10-Hour Rest Breach
  // Tue finishes at 22:30, Wed starts at 07:00 (8.5h gap < 10h) -> Wed 07:00-11:00 (4h) @ 200% Double Time
  fortnight.days[8].workBlocks = [
    {
      id: 'demo-tc3-a',
      blockType: 'REGULAR_CLIENT',
      startTime: '14:30',
      endTime: '22:30',
      unpaidMealBreakMinutes: 0,
      paidClientMealMinutes: 0,
      hasClinicalAssistance: false,
      isRecallOvertime: false,
      remoteContext: 'NOT_ON_CALL',
      rosteredHours: 0,
    },
  ];
  fortnight.days[9].workBlocks = [
    {
      id: 'demo-tc3-b',
      blockType: 'REGULAR_CLIENT',
      startTime: '07:00',
      endTime: '11:00',
      unpaidMealBreakMinutes: 0,
      paidClientMealMinutes: 0,
      hasClinicalAssistance: false,
      isRecallOvertime: false,
      remoteContext: 'NOT_ON_CALL',
      rosteredHours: 0,
    },
  ];

  return fortnight;
}

