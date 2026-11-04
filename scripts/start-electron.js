#!/usr/bin/env node
const electron = require('electron');
const { spawn } = require('child_process');

delete process.env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, process.argv.slice(2), {
  stdio: 'inherit',
  windowsHide: false,
  env: process.env,
});

child.on('close', (code, signal) => {
  if (code === null) {
    process.exit(1);
  }
  process.exit(code);
});

const handleSignal = (signal) => {
  process.on(signal, () => {
    if (!child.killed) {
      child.kill(signal);
    }
  });
};

handleSignal('SIGINT');
handleSignal('SIGTERM');

