'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const SET_MONITORING_ACTIVE_CHANNEL = 'desktop:set-monitoring-active';

const desktopRuntime = Object.freeze({
  isDesktop: true,
  platform: process.platform,
  setMonitoringActive(active) {
    if (typeof active !== 'boolean') {
      throw new TypeError('setMonitoringActive expects a boolean value.');
    }
    ipcRenderer.send(SET_MONITORING_ACTIVE_CHANNEL, active);
  },
});

contextBridge.exposeInMainWorld('desktopRuntime', desktopRuntime);
