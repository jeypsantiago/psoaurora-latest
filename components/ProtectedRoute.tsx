import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useRbac } from '../RbacContext';
import { Permission } from '../types';
import { useUsers } from '../UserContext';
import { SecureWorkspaceBootstrap } from './SecureWorkspaceBootstrap';
import { ShieldAlert } from 'lucide-react';

interface ProtectedRouteProps {
    children: React.ReactNode;
    requires?: Permission;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requires }) => {
    const { currentUser, isReady } = useUsers();
    const { can } = useRbac();
    const location = useLocation();

    const isSuperAdmin = !!currentUser?.isSuperAdmin || !!currentUser?.roles?.includes('Super Admin');
    const hasAccess = !requires || isSuperAdmin || can(requires);

    if (!isReady) {
        return <SecureWorkspaceBootstrap />;
    }

    if (!currentUser) {
        // Redirect to login if not authenticated
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    if (!hasAccess) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
                <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-500 flex items-center justify-center mb-6 border border-red-200 dark:border-red-900/40">
                    <ShieldAlert className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">
                    Access Denied
                </h2>
                <p className="text-zinc-500 dark:text-zinc-400 max-w-md text-sm leading-relaxed">
                    You do not have the required permissions to view this page. Please contact the administrator if you believe this is an error.
                </p>
            </div>
        );
    }

    return <>{children}</>;
};
