using System;
using PoyntPOSBridge;

namespace godaddy_bridge
{
    public class BridgeLogger : ILogger
    {
        private LoggingLevel _logLevel = LoggingLevel.INFO;

        public LoggingLevel LogLevel
        {
            get => _logLevel;
            set => _logLevel = value;
        }

        public bool IsDebugEnabled => _logLevel <= LoggingLevel.DEBUG;
        public bool IsInfoEnabled => _logLevel <= LoggingLevel.INFO;
        public bool IsWarnEnabled => _logLevel <= LoggingLevel.WARN;
        public bool IsErrorEnabled => _logLevel <= LoggingLevel.ERROR;
        public bool IsFatalEnabled => _logLevel <= LoggingLevel.FATAL;

        private void WriteLog(string level, string message)
        {
            Console.Error.WriteLine($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] [{level}] {message}");
        }

        public void Debug(string message) => WriteLog("DEBUG", message);
        public void Info(string message) => WriteLog("INFO", message);
        public void Warn(string message) => WriteLog("WARN", message);
        public void Error(string message) => WriteLog("ERROR", message);
        public void Fatal(string message) => WriteLog("FATAL", message);
    }
}
