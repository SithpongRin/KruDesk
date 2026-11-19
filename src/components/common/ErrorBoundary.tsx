import React from 'react';
import { AlertTriangle, RotateCw, HardDriveDownload } from 'lucide-react';
import { isStaleChunkError, tryReloadOnceForStaleChunk } from '../../lib/chunkReload';
import { downloadBackupJson } from '../../services/backup';
import { AppleButton } from './AppleButton';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  backupMessage: string | null;
  isBackingUp: boolean;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      backupMessage: null,
      isBackingUp: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    if (isStaleChunkError(error) && tryReloadOnceForStaleChunk()) {
      return;
    }
    console.error('KruDesk ErrorBoundary caught error:', error, info);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleRescueBackup = async () => {
    this.setState({ isBackingUp: true, backupMessage: null });
    try {
      const { fileName } = await downloadBackupJson();
      this.setState({
        isBackingUp: false,
        backupMessage: `បានទាញយកឯកសារបម្រុងទុក ${fileName} ដោយជោគជ័យ!`,
      });
    } catch (err) {
      this.setState({
        isBackingUp: false,
        backupMessage:
          err instanceof Error
            ? `មិនអាចទាញយក Backup បានទេ៖ ${err.message}`
            : 'មិនអាចទាញយក Backup បានទេ។',
      });
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen w-full bg-[#f5f5f7] dark:bg-[#111214] flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-lg bg-white dark:bg-[#1c1c1e] rounded-3xl border border-black/[0.08] dark:border-white/[0.1] shadow-[0_20px_60px_rgba(0,0,0,0.12)] p-6 sm:p-8 space-y-5 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#ffefef] dark:bg-red-500/15 text-[#ff3b30] flex items-center justify-center">
            <AlertTriangle size={28} />
          </div>

          <div className="space-y-1.5">
            <h1 className="font-moul text-lg text-[#1d1d1f] dark:text-[#f5f5f7]">
              មានបញ្ហាបច្ចេកទេសក្នុងកម្មវិធី
            </h1>
            <p className="text-xs text-[#6e6e73] dark:text-[#98989d] leading-relaxed">
              សូមអភ័យទោស! កម្មវិធីបានជួបប្រទះកំហុសដែលមិនបានរំពឹងទុក។ អ្នកអាចទាញយកឯកសារ Backup ដើម្បីរក្សាទុកទិន្នន័យសិន ឬផ្ទុកទំព័រឡើងវិញ។
            </p>
          </div>

          {this.state.error && (
            <div className="text-left p-3 rounded-xl bg-[#f5f5f7] dark:bg-white/[0.06] border border-black/[0.05] dark:border-white/[0.08] text-[11px] font-mono text-[#ff3b30] break-words max-h-28 overflow-y-auto">
              {this.state.error.message || String(this.state.error)}
            </div>
          )}

          {this.state.backupMessage && (
            <div className="p-3 rounded-xl bg-[#edf9f0] dark:bg-emerald-500/15 text-xs text-[#1d1d1f] dark:text-[#f5f5f7]">
              {this.state.backupMessage}
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
            <AppleButton
              type="button"
              variant="primary"
              icon={<RotateCw size={15} />}
              onClick={this.handleReload}
              className="w-full sm:w-auto"
            >
              Reload
            </AppleButton>

            <AppleButton
              type="button"
              variant="secondary"
              icon={<HardDriveDownload size={15} />}
              onClick={this.handleRescueBackup}
              disabled={this.state.isBackingUp}
              className="w-full sm:w-auto"
            >
              {this.state.isBackingUp ? 'កំពុងទាញយក...' : 'ទាញយក Backup'}
            </AppleButton>
          </div>
        </div>
      </div>
    );
  }
}
