package com.brick.safety.privileged;

import android.os.Bundle;

/**
 * Phase 6 privileged contract. Every operation is typed and bounded; there is deliberately no
 * arbitrary command, shell, package-name or file API exposed to the normal Brick process.
 */
interface IBrickPrivilegedService {
    Bundle capabilities();
    boolean setLocationEnabled(boolean enabled);
    Bundle wifiEvidence();
    Bundle bleEvidence();
    Bundle cellEvidence();
    Bundle powerDiagnostics();
    boolean requestPowerRepair();
    boolean attemptSosLocationEnable();
    void destroy() = 16777114;
}
