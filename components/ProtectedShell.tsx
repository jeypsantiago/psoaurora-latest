import React from "react";
import { Outlet } from "react-router-dom";
import { DialogProvider } from "../DialogContext";
import { ToastProvider } from "../ToastContext";
import { RbacProvider } from "../RbacContext";
import { Layout } from "./Layout";

export const ProtectedShell: React.FC = () => {
  return (
    <RbacProvider>
      <DialogProvider>
        <ToastProvider>
          <Layout>
            <Outlet />
          </Layout>
        </ToastProvider>
      </DialogProvider>
    </RbacProvider>
  );
};

export default ProtectedShell;
