#!/usr/bin/env node
/**
 * Reslim cached signal list JSON after export skip or CI cache restore.
 * Run: node scripts/finalize-signals-on-disk.mjs
 */
import { finalizeSignalsOnDisk } from './lib/finalize-signals-on-disk.mjs';

finalizeSignalsOnDisk();