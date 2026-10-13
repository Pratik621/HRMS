// src/App.jsx
import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import './index.css';

// Layout & Auth — always needed, load eagerly
import Navbar from './components/Layout/Navbar';
import Sidebar from './components/Layout/Sidebar';
import Login from './components/Auth/Login';
import Unauthorized from './components/Auth/Unauthorized';
import NetworkBlocked from './components/Auth/NetworkBlocked';

// Context
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import GlobalNotification from './components/Common/GlobalNotification';
import { Spinner } from 'react-bootstrap';

// Admin — lazy loaded (only fetched when the route is visited)
const AdminDashboard      = lazy(() => import('./components/Admin/Dashboard'));
const EmployeeList        = lazy(() => import('./components/Admin/EmployeeList'));
const AddEmployee         = lazy(() => import('./components/Admin/AddEmployee'));
const EditEmployee        = lazy(() => import('./components/Admin/EditEmployee'));
const LeaveRequests       = lazy(() => import('./components/Admin/LeaveRequests'));
const LeaveReports        = lazy(() => import('./components/Admin/LeaveReports'));
const AttendanceDashboard = lazy(() => import('./components/Admin/AttendanceDashboard'));
const AttendanceReports   = lazy(() => import('./components/Admin/AttendanceReports'));
const SendUpdateRequest   = lazy(() => import('./components/Admin/SendUpdateRequest'));
const UpdateApprovals     = lazy(() => import('./components/Admin/UpdateApprovals'));
const SendNotice          = lazy(() => import('./components/Admin/SendNotice'));
const Announcements       = lazy(() => import('./components/Admin/Announcements'));
const AdminBroadcast      = lazy(() => import('./components/Admin/AdminBroadcast'));
const EmployeeProfileView = lazy(() => import('./components/Admin/EmployeeProfileView'));
const AdminRatings        = lazy(() => import('./components/Admin/AdminRatings'));
const Teams               = lazy(() => import('./components/Admin/Teams'));
const PayrollCenter       = lazy(() => import('./components/Admin/Payroll/PayrollCenter'));
const DeductionManager    = lazy(() => import('./components/Admin/DeductionManager'));
const LeaveBalanceAdjustment = lazy(() => import('./components/Admin/LeaveBalanceAdjustment'));
const EmailCenter         = lazy(() => import('./components/Admin/EmailCenter'));
const FinanceExport       = lazy(() => import('./components/Admin/FinanceExport'));
const ManagerTeam         = lazy(() => import('./components/Admin/ManagerTeam'));
const AdminManagerTeams   = lazy(() => import('./components/Admin/AdminManagerTeams'));
const EditSlip            = lazy(() => import('./components/Admin/EditSlip'));
const HousekeeperNetworkSecurity = lazy(() => import('./components/Admin/HousekeeperNetworkSecurity'));

// Manager — lazy loaded
const ManagerDashboard = lazy(() => import('./components/Manager/Dashboard'));

// Performance — lazy loaded
const PerformanceReviews = lazy(() => import('./components/Performance/PerformanceReviews'));
const PerformanceHistory = lazy(() => import('./components/Performance/PerformanceHistory'));

// Employee — lazy loaded
const EmployeeDashboard      = lazy(() => import('./components/Employee/Dashboard'));
const Profile                = lazy(() => import('./components/Employee/Profile'));
const ProfileEdit            = lazy(() => import('./components/Employee/ProfileEdit'));
const ApplyLeave             = lazy(() => import('./components/Employee/ApplyLeave'));
const Payroll = lazy(() => import('./components/Employee/Payroll'));
const Attendance             = lazy(() => import('./components/Employee/Attendance'));
const EmployeeUpdateRequests = lazy(() => import('./components/Employee/EmployeeUpdateRequests'));
const EmployeeUpdateForm     = lazy(() => import('./components/Employee/EmployeeUpdateForm'));
const ManagerLeaveRequests   = lazy(() => import('./components/Employee/ManagerLeaveRequests'));
const ManagerShiftUpdate     = lazy(() => import('./components/Employee/ManagerShiftUpdate'));
const ManagerPanel           = lazy(() => import('./components/Employee/ManagerPanel'));

// Tickets — lazy loaded
const TicketList = lazy(() => import('./components/Tickets/TicketList'));

// Onboarding — public pages (no auth required)
const OnboardingPage    = lazy(() => import('./pages/OnboardingPage'));
const OnboardingFormPage = lazy(() => import('./pages/OnboardingFormPage'));

// Shared fallback shown while a lazy chunk is being fetched
const PageLoader = () => (
  <div style={{
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'var(--body-bg, #f8f9fa)', zIndex: 9999
  }}>
    <Spinner animation="border" variant="primary" />
  </div>
);

// Private Route Component
const PrivateRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f8f9fa',
        zIndex: 9999
      }}>
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
};

// Main App Content
function AppContent() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';
  const isUnauthorizedPage = location.pathname === '/unauthorized';
  const isNetworkBlockedPage = location.pathname === '/network-blocked';
  const isOnboardingPage = location.pathname.startsWith('/onboarding/');

  // Public onboarding pages — render immediately, no auth check needed
  if (isOnboardingPage) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/onboarding/:token/form" element={<OnboardingFormPage />} />
          <Route path="/onboarding/:token" element={<OnboardingPage />} />
        </Routes>
      </Suspense>
    );
  }

  if (loading) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f8f9fa',
        zIndex: 9999
      }}>
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  // If on login/unauthorized page, render without layout
  if (isLoginPage) return <Login />;
  if (isUnauthorizedPage) return <Unauthorized />;
  if (isNetworkBlockedPage) return <NetworkBlocked />;


  // For all other pages, render with sidebar and navbar
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', position: 'relative' }}>
      {/* Sidebar */}
      {user && <Sidebar />}

      {/* Main Content Area */}
      <div
        id="main-content-wrapper"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          backgroundColor: 'var(--body-bg)',
          transition: 'margin-left 0.25s ease'
        }}
      >
        {/* Navbar */}
        {user && <Navbar />}

        {/* Page Content */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '28px',
          backgroundColor: 'var(--body-bg)'
        }}>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Dashboard Route - Conditional based on role */}
            <Route path="/" element={
              <PrivateRoute allowedRoles={['admin', 'sub_admin', 'manager', 'employee', 'desktop_support', 'finance', 'hr', 'housekeeper']}>
                {user?.role === 'admin' || user?.role === 'desktop_support' || user?.role === 'hr' ? <AdminDashboard /> : user?.role === 'sub_admin' ? <AdminDashboard /> : user?.role === 'manager' ? <ManagerDashboard /> : user?.role === 'finance' ? <FinanceExport /> : <EmployeeDashboard />}
              </PrivateRoute>
            } />

            {/* Admin Routes */}
            <Route path="/admin/dashboard" element={
              <PrivateRoute allowedRoles={['admin', 'desktop_support', 'hr']}>
                <AdminDashboard />
              </PrivateRoute>
            } />

            {/* Sub Admin Routes */}
            <Route path="/subadmin/dashboard" element={
              <PrivateRoute allowedRoles={['sub_admin']}>
                <AdminDashboard />
              </PrivateRoute>
            } />

            {/* Manager Routes */}
            <Route path="/manager/dashboard" element={
              <PrivateRoute allowedRoles={['admin', 'manager', 'hr']}>
                <ManagerDashboard />
              </PrivateRoute>
            } />

            <Route path="/admin/employees" element={
              <PrivateRoute allowedRoles={['admin', 'sub_admin', 'desktop_support', 'hr']}>
                <EmployeeList />
              </PrivateRoute>
            } />

            <Route path="/admin/add-employee" element={
              <PrivateRoute allowedRoles={['admin', 'sub_admin', 'desktop_support', 'hr']}>
                <AddEmployee />
              </PrivateRoute>
            } />

            <Route path="/admin/edit-employee/:id" element={
              <PrivateRoute allowedRoles={['admin', 'sub_admin', 'desktop_support', 'hr']}>
                <EditEmployee />
              </PrivateRoute>
            } />

            <Route path="/admin/employees/:employeeId" element={
              <PrivateRoute allowedRoles={['admin', 'sub_admin', 'hr']}>
                <EmployeeProfileView />
              </PrivateRoute>
            } />

            <Route path="/admin/leave-requests" element={
              <PrivateRoute allowedRoles={['admin', 'sub_admin', 'hr']}>
                <LeaveRequests />
              </PrivateRoute>
            } />

            <Route path="/admin/leave-reports" element={
              <PrivateRoute allowedRoles={['admin', 'sub_admin', 'hr']}>
                <LeaveReports />
              </PrivateRoute>
            } />

            {/* Admin Attendance Routes */}
            <Route path="/admin/attendance/dashboard" element={
              <PrivateRoute allowedRoles={['admin', 'sub_admin', 'hr']}>
                <AttendanceDashboard />
              </PrivateRoute>
            } />

            <Route path="/admin/attendance/reports" element={
              <PrivateRoute allowedRoles={['admin', 'sub_admin', 'hr']}>
                <AttendanceReports />
              </PrivateRoute>
            } />

            {/* Admin Ratings Route */}
            <Route path="/admin/ratings" element={
              <PrivateRoute allowedRoles={['admin', 'sub_admin', 'hr']}>
                <AdminRatings />
              </PrivateRoute>
            } />

            {/* Centralized Payroll module */}
            <Route path="/admin/payroll" element={
              <PrivateRoute allowedRoles={['admin', 'sub_admin', 'hr']}>
                <PayrollCenter />
              </PrivateRoute>
            } />

            {/* Deductions */}
            <Route path="/admin/deductions" element={
              <PrivateRoute allowedRoles={['admin', 'sub_admin', 'hr']}>
                <DeductionManager />
              </PrivateRoute>
            } />

            {/* Leave Balance Adjustment — HR/Admin add or reduce Paid Leave / Comp-Off, no approval flow */}
            <Route path="/admin/leave-balance" element={
              <PrivateRoute allowedRoles={['admin', 'sub_admin', 'hr']}>
                <LeaveBalanceAdjustment />
              </PrivateRoute>
            } />

            {/* Email — Admin/HR manual compose to Managers/Team Leaders/HR/individual employees */}
            <Route path="/admin/email" element={
              <PrivateRoute allowedRoles={['admin', 'sub_admin', 'hr']}>
                <EmailCenter />
              </PrivateRoute>
            } />

            {/* Manual Salary Slip Generator — Admin ONLY, localStorage-only, never touches
                the database/attendance/main Payroll module (see EditSlip.jsx header comment) */}
            <Route path="/editslip" element={
              <PrivateRoute allowedRoles={['admin']}>
                <EditSlip />
              </PrivateRoute>
            } />

            <Route path="/admin/teams" element={
              <PrivateRoute allowedRoles={['admin', 'sub_admin', 'manager', 'desktop_support', 'hr']}>
                <Teams />
              </PrivateRoute>
            } />

            {/* Admin Update Routes */}
            <Route path="/employee/update-info/:requestId" element={
              <PrivateRoute allowedRoles={['employee', 'housekeeper']}>
                <EmployeeUpdateForm />
              </PrivateRoute>
            } />

            <Route path="/admin/send-update-request" element={
              <PrivateRoute allowedRoles={['admin', 'sub_admin', 'hr']}>
                <SendUpdateRequest />
              </PrivateRoute>
            } />

            <Route path="/admin/update-approvals" element={
              <PrivateRoute allowedRoles={['admin', 'sub_admin', 'hr']}>
                <UpdateApprovals />
              </PrivateRoute>
            } />

            {/* BROADCAST CENTER - combined notice + announcements */}
            <Route path="/admin/broadcast" element={
              <PrivateRoute allowedRoles={['admin', 'sub_admin', 'hr']}>
                <AdminBroadcast />
              </PrivateRoute>
            } />
            
            {/* Housekeeper IP Access Control */}
            <Route path="/admin/network-security" element={
              <PrivateRoute allowedRoles={['admin', 'sub_admin', 'hr']}>
                <HousekeeperNetworkSecurity />
              </PrivateRoute>
            } />

            {/* old routes redirect */}
            <Route path="/admin/announcements" element={<Navigate to="/admin/broadcast" replace />} />
            <Route path="/admin/send-notice" element={<Navigate to="/admin/broadcast" replace />} />

            {/* Employee Routes */}
            <Route path="/employee/dashboard" element={
              <PrivateRoute allowedRoles={['employee', 'manager', 'admin', 'hr', 'housekeeper']}>
                <EmployeeDashboard />
              </PrivateRoute>
            } />

            <Route path="/profile" element={
              <PrivateRoute allowedRoles={['admin', 'sub_admin', 'manager', 'employee', 'hr', 'housekeeper']}>
                <Profile />
              </PrivateRoute>
            } />

            <Route path="/profile/edit" element={
              <PrivateRoute allowedRoles={['employee', 'manager', 'housekeeper']}>
                <ProfileEdit />
              </PrivateRoute>
            } />

            <Route path="/employee/update-requests" element={
              <PrivateRoute allowedRoles={['employee', 'manager', 'housekeeper']}>
                <EmployeeUpdateRequests />
              </PrivateRoute>
            } />

            <Route path="/apply-leave" element={
              <PrivateRoute allowedRoles={['employee', 'manager', 'housekeeper']}>
                <ApplyLeave />
              </PrivateRoute>
            } />

            <Route path="/salary-slip" element={
              <PrivateRoute allowedRoles={['employee', 'manager', 'housekeeper']}>
                <Payroll />
              </PrivateRoute>
            } />

            <Route path="/employee/deductions" element={
              <PrivateRoute allowedRoles={['employee', 'manager', 'housekeeper']}>
                <Payroll />
              </PrivateRoute>
            } />

            <Route path="/attendance" element={
              <PrivateRoute allowedRoles={['employee', 'manager', 'sub_admin', 'housekeeper']}>
                <Attendance />
              </PrivateRoute>
            } />

            <Route path="/manager/panel" element={
              <PrivateRoute allowedRoles={['employee', 'manager', 'admin', 'hr', 'sub_admin']}>
                <ManagerPanel />
              </PrivateRoute>
            } />

            {/* Keep old routes as redirects for backward compatibility */}
            <Route path="/manager/leave-requests" element={<Navigate to="/manager/panel" replace />} />
            <Route path="/manager/shift-update" element={<Navigate to="/manager/panel" replace />} />
            <Route path="/manager/send-notice" element={<Navigate to="/manager/panel" replace />} />

            {/* Performance Routes */}
            <Route path="/performance/reviews" element={
              <PrivateRoute allowedRoles={['admin', 'sub_admin', 'manager', 'hr']}>
                <PerformanceReviews />
              </PrivateRoute>
            } />
            <Route path="/performance/history" element={
              <PrivateRoute allowedRoles={['admin', 'sub_admin', 'manager', 'employee', 'hr', 'housekeeper']}>
                <PerformanceHistory />
              </PrivateRoute>
            } />

            {/* Finance Routes */}
            <Route path="/finance/export" element={
              <PrivateRoute allowedRoles={['admin', 'sub_admin', 'finance', 'hr']}>
                <FinanceExport />
              </PrivateRoute>
            } />

            {/* Manager My Team */}
            <Route path="/manager/my-team" element={
              <PrivateRoute allowedRoles={['sub_admin']}>
                <ManagerTeam />
              </PrivateRoute>
            } />

            {/* Admin — Manager Teams management */}
            <Route path="/admin/manager-teams" element={
              <PrivateRoute allowedRoles={['admin', 'sub_admin', 'hr']}>
                <AdminManagerTeams />
              </PrivateRoute>
            } />

            {/* Support Tickets — all authenticated roles */}
            <Route path="/tickets" element={
              <PrivateRoute allowedRoles={['admin', 'sub_admin', 'manager', 'employee', 'hr', 'housekeeper']}>
                <TicketList />
              </PrivateRoute>
            } />
            {/* Deep link to a specific ticket (e.g. from a notification) — same component,
                TicketList reads the :id param and opens that ticket's detail modal. */}
            <Route path="/tickets/:id" element={
              <PrivateRoute allowedRoles={['admin', 'sub_admin', 'manager', 'employee', 'hr']}>
                <TicketList />
              </PrivateRoute>
            } />

            {/* Redirect for any unknown routes */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </div>
      </div>

      {/* Global Notification */}
      <GlobalNotification />
    </div>
  );
}

// Main App Component
function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <Router>
          <AppContent />
        </Router>
      </NotificationProvider>
    </AuthProvider>
  );
}

export default App;