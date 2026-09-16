import React from 'react';
import AttendanceCard from './AttendanceCard';
import HolidayCountdownCard from './HolidayCountdownCard';
import LeaveBalanceRingsCard from './LeaveBalanceRingsCard';
import AttendanceInsightsCard from './AttendanceInsightsCard';
import RegularizationStatsWidget from './RegularizationStatsWidget';
import OnLeaveTodayCard from './OnLeaveTodayCard';
import CelebrationsCard from './CelebrationsCard';
import PostComposerCard from './PostComposerCard';
import { QA_ANIMATIONS_CSS } from './quickAccessTheme';

const QUICK_ACCESS_CSS = `
  .dash-quick-access {
    display: grid;
    grid-template-columns: 330px 1fr;
    gap: 16px;
    margin-bottom: 20px;
    align-items: start;
  }
  .dash-quick-access__left {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .dash-quick-access__right {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
  }
  @media (max-width: 900px) {
    .dash-quick-access { grid-template-columns: 1fr; }
  }
`;

export default function DashboardQuickAccess({
  employeeId,
  onLeaveScope = 'department',
  department,
  attendance,
  activeSession,
  onClockIn,
  onRequestClockOut,
  clockLoading,
  readOnly = false,
  readOnlyMessage,
  disabledMobile = false,
  canClockOut = true,
  shiftTiming,
  footerExtra,
  unlimitedBreaks = false,
  managerId,
  hideClockToggle = false,
}) {
  return (
    <div className="dash-quick-access">
      <style>{QUICK_ACCESS_CSS}{QA_ANIMATIONS_CSS}</style>
      <div className="dash-quick-access__left">
        <AttendanceCard
          attendance={attendance}
          activeSession={activeSession}
          onClockIn={onClockIn}
          onRequestClockOut={onRequestClockOut}
          clockLoading={clockLoading}
          readOnly={readOnly}
          readOnlyMessage={readOnlyMessage}
          disabledMobile={disabledMobile}
          canClockOut={canClockOut}
          shiftTiming={shiftTiming}
          footerExtra={footerExtra}
          unlimitedBreaks={unlimitedBreaks}
          hideClockToggle={hideClockToggle}
        />
        <RegularizationStatsWidget managerId={managerId} />
        <HolidayCountdownCard />
        <LeaveBalanceRingsCard employeeId={employeeId} />
        <OnLeaveTodayCard scope={onLeaveScope} department={department} managerId={managerId} />
      </div>
      <div className="dash-quick-access__right">
        <PostComposerCard />
        <CelebrationsCard />
        <AttendanceInsightsCard employeeId={employeeId} />

      </div>
    </div>
  );
}
