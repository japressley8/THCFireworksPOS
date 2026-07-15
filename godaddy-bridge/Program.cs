using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using PoyntPOSBridge;

namespace godaddy_bridge
{
    class Program
    {
        private static readonly BridgeLogger Logger = new BridgeLogger();

        static async Task Main(string[] args)
        {
            // Configure UTF-8 encoding for standard I/O
            try
            {
                Console.InputEncoding = Encoding.UTF8;
                Console.OutputEncoding = Encoding.UTF8;
            }
            catch (Exception)
            {
                // Ignore console handle errors when running windowless
            }

            Logger.Info("GoDaddy Terminal Bridge Sidecar starting up...");

            string line;
            while ((line = Console.ReadLine()) != null)
            {
                if (string.IsNullOrWhiteSpace(line)) continue;

                // Robust trimming: Strip BOM or any preamble characters before the first JSON brace
                int firstBrace = line.IndexOf('{');
                if (firstBrace > 0)
                {
                    line = line.Substring(firstBrace);
                }
                else if (firstBrace < 0)
                {
                    // Not valid JSON command, ignore
                    continue;
                }

                string requestId = "unknown";
                try
                {
                    var request = JsonConvert.DeserializeObject<JObject>(line);
                    if (request == null) continue;

                    requestId = request["id"]?.ToString() ?? "unknown";
                    string cmd = request["cmd"]?.ToString() ?? "";
                    var parameters = request["params"] as JObject ?? new JObject();

                    Logger.Info($"Processing command '{cmd}' (ID: {requestId})");

                    JToken data = null;
                    switch (cmd.ToLower())
                    {
                        case "ping":
                            data = await HandlePing(parameters);
                            break;
                        case "pair":
                            data = await HandlePair(parameters);
                            break;
                        case "sale":
                            data = await HandleSale(parameters);
                            break;
                        case "refund":
                            data = await HandleRefund(parameters);
                            break;
                        case "void":
                            data = await HandleVoid(parameters);
                            break;
                        case "print":
                            data = await HandlePrint(parameters);
                            break;
                        case "discover":
                            data = await HandleDiscover(parameters);
                            break;
                        case "second_screen":
                            data = await HandleSecondScreen(parameters);
                            break;
                        case "scan_barcode":
                            data = await HandleScanBarcode(parameters);
                            break;
                        default:
                            throw new Exception($"Unknown command: {cmd}");
                    }

                    SendResponse(requestId, true, data, null);
                }
                catch (Exception ex)
                {
                    Logger.Error($"Error executing request '{requestId}': {ex.Message}");
                    SendResponse(requestId, false, null, ex.ToString());
                }
            }

            Logger.Info("GoDaddy Terminal Bridge Sidecar exiting...");
        }

        private static void SendResponse(string id, bool success, JToken data, string error)
        {
            var response = new JObject
            {
                ["id"] = id,
                ["success"] = success,
                ["data"] = data,
                ["error"] = error
            };

            string jsonLine = response.ToString(Formatting.None);
            Console.WriteLine(jsonLine);
        }

        #region Command Handlers

        private static Task<JToken> HandlePing(JObject parameters)
        {
            string ip = parameters["ip"]?.ToString() ?? throw new ArgumentException("IP address is required");
            string key = parameters["key"]?.ToString() ?? "";
            var api = new PoyntPOSApi(ip, Logger) { Key = key };
            bool isOnline = api.PingDevice();
            
            return Task.FromResult<JToken>(new JObject
            {
                ["online"] = isOnline
            });
        }

        private static Task<JToken> HandlePair(JObject parameters)
        {
            string ip = parameters["ip"]?.ToString() ?? throw new ArgumentException("IP address is required");
            string pairingCode = parameters["pairingCode"]?.ToString() ?? throw new ArgumentException("Pairing code is required");

            var api = new PoyntPOSApi(ip, Logger) { Key = pairingCode };
            PairDeviceResponse res = api.PairDevice("THC Fireworks POS");

            bool isSuccess = res.Status == "Success" || (res.Error == null || res.Error.Count == 0);
            
            var data = new JObject
            {
                ["paired"] = isSuccess,
                ["key"] = api.Key, // This gets populated by PairDevice
                ["serial"] = res.SerialNumber,
                ["status"] = res.Status,
                ["timedOut"] = res.TimedOut
            };

            if (res.Error != null && res.Error.Count > 0)
            {
                data["errorDetails"] = JObject.FromObject(res.Error);
            }

            return Task.FromResult<JToken>(data);
        }

        private static Task<JToken> HandleSale(JObject parameters)
        {
            string ip = parameters["ip"]?.ToString() ?? throw new ArgumentException("IP address is required");
            string key = parameters["key"]?.ToString() ?? throw new ArgumentException("Pairing key is required");
            int amount = parameters["amount"]?.ToObject<int>() ?? throw new ArgumentException("Amount is required");
            string referenceId = parameters["referenceId"]?.ToString() ?? Guid.NewGuid().ToString();
            int timeoutMs = parameters["timeoutMs"]?.ToObject<int>() ?? 60000;

            var api = new PoyntPOSApi(ip, Logger) { Key = key };
            
            AuthorizeSalesRequest req = AuthorizeSalesRequest.Create(timeoutMs, "USD", amount);
            if (req.Payment != null)
            {
                req.Payment.ReferenceId = referenceId;
            }
            // Customize payment options if provided
            if (parameters["creditOnly"]?.ToObject<bool>() == true)
            {
                req.Payment.CreditOnly = true;
            }
            if (parameters["disableTip"]?.ToObject<bool>() == true)
            {
                req.Payment.DisableTip = true;
            }

            AuthorizeSalesResponse res = api.AuthorizeSales(req);

            var data = new JObject
            {
                ["timedOut"] = res.TimedOut,
                ["poyntRequestId"] = res.PoyntRequestId
            };

            if (res.Error != null && res.Error.Count > 0)
            {
                data["success"] = false;
                data["errorDetails"] = JObject.FromObject(res.Error);
            }
            else if (res.Payment != null)
            {
                data["success"] = res.Payment.Status?.ToUpper() == "SUCCESS" || res.Payment.Status?.ToUpper() == "COMPLETED" || res.Payment.Status?.ToUpper() == "APPROVED";
                
                string txId = null;
                string approvalCode = null;
                string fundingSourceType = null;
                if (res.Payment.Transactions != null && res.Payment.Transactions.Count > 0)
                {
                    var tx = res.Payment.Transactions[0];
                    txId = tx.Id;
                    approvalCode = tx.ApprovalCode;
                    // FundingSource.Type indicates how the customer paid (e.g. "CASH", "CREDIT_DEBIT", "DEBIT", "CHECK")
                    fundingSourceType = tx.FundingSource?.Type;
                }
                
                data["transactionId"] = txId;
                data["status"] = res.Payment.Status;
                data["amount"] = res.Payment.Amount;
                data["approvalCode"] = approvalCode;
                data["fundingSourceType"] = fundingSourceType;
            }
            else
            {
                data["success"] = false;
                data["errorDetails"] = "No payment details returned from terminal.";
            }

            return Task.FromResult<JToken>(data);
        }

        private static Task<JToken> HandleRefund(JObject parameters)
        {
            string ip = parameters["ip"]?.ToString() ?? throw new ArgumentException("IP address is required");
            string key = parameters["key"]?.ToString() ?? throw new ArgumentException("Pairing key is required");
            string transactionId = parameters["transactionId"]?.ToString();
            int? amount = parameters["amount"]?.ToObject<int?>();
            int timeoutMs = parameters["timeoutMs"]?.ToObject<int>() ?? 60000;

            var api = new PoyntPOSApi(ip, Logger) { Key = key };

            AuthorizeSalesResponse res;
            if (string.IsNullOrEmpty(transactionId))
            {
                // Non-referenced refund (requires amount)
                if (amount == null) throw new ArgumentException("Amount is required for non-referenced refund");
                var req = AuthorizeNonReferencedRefundRequest.Create(timeoutMs, amount);
                res = api.AuthorizeRefund(req);
            }
            else
            {
                // Referenced refund (amount can be null for full refund, or specified for partial)
                var req = AuthorizeRefundRequest.Create(timeoutMs, transactionId, amount);
                res = api.AuthorizeRefund(req);
            }

            var data = new JObject
            {
                ["timedOut"] = res.TimedOut,
                ["poyntRequestId"] = res.PoyntRequestId
            };

            if (res.Error != null && res.Error.Count > 0)
            {
                data["success"] = false;
                data["errorDetails"] = JObject.FromObject(res.Error);
            }
            else if (res.Payment != null)
            {
                data["success"] = res.Payment.Status?.ToUpper() == "SUCCESS" || res.Payment.Status?.ToUpper() == "COMPLETED" || res.Payment.Status?.ToUpper() == "APPROVED";
                
                string txId = null;
                if (res.Payment.Transactions != null && res.Payment.Transactions.Count > 0)
                {
                    txId = res.Payment.Transactions[0].Id;
                }
                
                data["transactionId"] = txId;
                data["status"] = res.Payment.Status;
                data["amount"] = res.Payment.Amount;
            }
            else
            {
                data["success"] = false;
                data["errorDetails"] = "No payment/refund details returned from terminal.";
            }

            return Task.FromResult<JToken>(data);
        }

        private static Task<JToken> HandleVoid(JObject parameters)
        {
            string ip = parameters["ip"]?.ToString() ?? throw new ArgumentException("IP address is required");
            string key = parameters["key"]?.ToString() ?? throw new ArgumentException("Pairing key is required");
            string transactionId = parameters["transactionId"]?.ToString() ?? throw new ArgumentException("Transaction ID is required");
            int timeoutMs = parameters["timeoutMs"]?.ToObject<int>() ?? 60000;

            var api = new PoyntPOSApi(ip, Logger) { Key = key };

            var req = new AuthorizeVoidRequest
            {
                PoyntRequestId = Guid.NewGuid().ToString(),
                TransactionId = transactionId,
                Timeout = timeoutMs,
                Payment = new Payment()
            };

            AuthorizeSalesResponse res = api.AuthorizeVoid(req);

            var data = new JObject
            {
                ["timedOut"] = res.TimedOut,
                ["poyntRequestId"] = res.PoyntRequestId
            };

            if (res.Error != null && res.Error.Count > 0)
            {
                data["success"] = false;
                data["errorDetails"] = JObject.FromObject(res.Error);
            }
            else if (res.Payment != null)
            {
                data["success"] = res.Payment.Status?.ToUpper() == "SUCCESS" || res.Payment.Status?.ToUpper() == "COMPLETED" || res.Payment.Status?.ToUpper() == "APPROVED" || res.Payment.Status?.ToUpper() == "VOIDED";
                
                string txId = null;
                if (res.Payment.Transactions != null && res.Payment.Transactions.Count > 0)
                {
                    txId = res.Payment.Transactions[0].Id;
                }
                
                data["transactionId"] = txId;
                data["status"] = res.Payment.Status;
            }
            else
            {
                // Voids might just succeed without returning payment details, or status changes
                data["success"] = true;
            }

            return Task.FromResult<JToken>(data);
        }

        private static Task<JToken> HandlePrint(JObject parameters)
        {
            string ip = parameters["ip"]?.ToString() ?? throw new ArgumentException("IP address is required");
            string key = parameters["key"]?.ToString() ?? throw new ArgumentException("Pairing key is required");
            string receiptText = parameters["receiptText"]?.ToString() ?? throw new ArgumentException("Receipt text is required");
            int timeoutMs = parameters["timeoutMs"]?.ToObject<int>() ?? 15000;

            var api = new PoyntPOSApi(ip, Logger) { Key = key };
            
            PrintReceiptRequest req = PrintReceiptRequest.Create(timeoutMs, receiptText);
            AuthorizeSalesResponse res = api.PrintReceipt(req);

            var data = new JObject
            {
                ["timedOut"] = res.TimedOut,
                ["poyntRequestId"] = res.PoyntRequestId
            };

            if (res.Error != null && res.Error.Count > 0)
            {
                data["success"] = false;
                data["errorDetails"] = JObject.FromObject(res.Error);
            }
            else
            {
                data["success"] = true;
            }

            return Task.FromResult<JToken>(data);
        }

        private static async Task<JToken> HandleDiscover(JObject parameters)
        {
            int timeoutMs = parameters["timeoutMs"]?.ToObject<int>() ?? 2000;

            Logger.Info("Starting service discovery...");
            
            // Run SSDP and Subnet TCP scan concurrently
            var ssdpTask = Task.Run(() => DiscoverSSDP(timeoutMs));
            var scanTask = ScanSubnetPort55555Async(timeoutMs);

            await Task.WhenAll(ssdpTask, scanTask);

            var results = new HashSet<string>();
            foreach (var ip in ssdpTask.Result) results.Add(ip);
            foreach (var ip in scanTask.Result) results.Add(ip);

            Logger.Info($"Service discovery complete. Found {results.Count} terminals.");

            var ipsArray = new JArray();
            foreach (var ip in results) ipsArray.Add(ip);

            return ipsArray;
        }

        private static Task<JToken> HandleSecondScreen(JObject parameters)
        {
            string ip = parameters["ip"]?.ToString() ?? throw new ArgumentException("IP address is required");
            string key = parameters["key"]?.ToString() ?? throw new ArgumentException("Pairing key is required");
            int total = parameters["total"]?.ToObject<int>() ?? throw new ArgumentException("Total amount is required");
            string currency = parameters["currency"]?.ToString() ?? "USD";
            var itemsToken = parameters["items"] as JArray;
            int timeoutMs = parameters["timeoutMs"]?.ToObject<int>() ?? 30000;

            var api = new PoyntPOSApi(ip, Logger) { Key = key };

            var orderItems = new List<OrderItem>();
            if (itemsToken != null)
            {
                foreach (var token in itemsToken)
                {
                    orderItems.Add(new OrderItem
                    {
                        Name = token["name"]?.ToString() ?? "Item",
                        UnitPrice = token["price"]?.ToObject<int>() ?? 0,
                        Quantity = token["quantity"]?.ToObject<float>() ?? 1.0f
                    });
                }
            }

            var request = new ShowItemsOnSecondScreenRequest
            {
                PoyntRequestId = Guid.NewGuid().ToString(),
                Timeout = timeoutMs,
                SecondScreenRequest = new SecondScreenRequest
                {
                    TotalAmount = total,
                    Currency = currency,
                    Items = orderItems
                }
            };

            AuthorizeSalesResponse res = api.ShowItemsOnSecondScreen(request);

            var data = new JObject
            {
                ["timedOut"] = res.TimedOut,
                ["poyntRequestId"] = res.PoyntRequestId
            };

            if (res.Error != null && res.Error.Count > 0)
            {
                data["success"] = false;
                data["errorDetails"] = JObject.FromObject(res.Error);
            }
            else
            {
                data["success"] = true;
            }

            return Task.FromResult<JToken>(data);
        }

        private static Task<JToken> HandleScanBarcode(JObject parameters)
        {
            string ip = parameters["ip"]?.ToString() ?? throw new ArgumentException("IP address is required");
            string key = parameters["key"]?.ToString() ?? throw new ArgumentException("Pairing key is required");

            var api = new PoyntPOSApi(ip, Logger) { Key = key };

            var req = new ScanDataRequest
            {
                PoyntRequestId = Guid.NewGuid().ToString()
            };

            ScanDataResponse res = api.ScanData(req);

            var data = new JObject
            {
                ["poyntRequestId"] = res.PoyntRequestId,
                ["status"] = res.Status,
                ["scanResult"] = res.ScanResult
            };

            return Task.FromResult<JToken>(data);
        }

        #endregion

        #region Discovery Implementations

        private static List<string> DiscoverSSDP(int timeoutMs)
        {
            var ips = new List<string>();
            try
            {
                using (var socket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp))
                {
                    socket.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.Broadcast, true);
                    socket.ReceiveTimeout = timeoutMs;

                    string query = "M-SEARCH * HTTP/1.1\r\n" +
                                   "HOST: 239.255.255.250:1900\r\n" +
                                   "MAN: \"ssdp:discover\"\r\n" +
                                   "MX: 2\r\n" +
                                   "ST: ssdp:all\r\n\r\n";

                    byte[] data = Encoding.UTF8.GetBytes(query);
                    var target = new IPEndPoint(IPAddress.Parse("239.255.255.250"), 1900);

                    socket.SendTo(data, target);

                    var buffer = new byte[4096];
                    var end = DateTime.Now.AddMilliseconds(timeoutMs);

                    while (DateTime.Now < end)
                    {
                        int timeRemaining = (int)(end - DateTime.Now).TotalMilliseconds;
                        if (timeRemaining <= 0) break;

                        if (socket.Poll(timeRemaining * 1000, SelectMode.SelectRead))
                        {
                            EndPoint remote = new IPEndPoint(IPAddress.Any, 0);
                            int len = socket.ReceiveFrom(buffer, ref remote);
                            string response = Encoding.UTF8.GetString(buffer, 0, len);

                            if (response.Contains("55555") || response.ToLower().Contains("poynt") || response.ToLower().Contains("godaddy"))
                            {
                                var ip = ((IPEndPoint)remote).Address.ToString();
                                if (!ips.Contains(ip))
                                {
                                    ips.Add(ip);
                                    Logger.Info($"SSDP Discovered Poynt terminal: {ip}");
                                }
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Warn($"SSDP discovery failed: {ex.Message}");
            }
            return ips;
        }

        private static async Task<List<string>> ScanSubnetPort55555Async(int timeoutMs)
        {
            var discovered = new List<string>();
            try
            {
                var localIPs = new List<(IPAddress ip, IPAddress mask)>();
                foreach (var ni in System.Net.NetworkInformation.NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (ni.OperationalStatus != System.Net.NetworkInformation.OperationalStatus.Up) continue;
                    if (ni.NetworkInterfaceType == System.Net.NetworkInformation.NetworkInterfaceType.Loopback) continue;

                    var ipProps = ni.GetIPProperties();
                    foreach (var unicast in ipProps.UnicastAddresses)
                    {
                        if (unicast.Address.AddressFamily == AddressFamily.InterNetwork)
                        {
                            localIPs.Add((unicast.Address, unicast.IPv4Mask));
                        }
                    }
                }

                var tasks = new List<Task<(string ip, bool open)>>();
                foreach (var (ip, mask) in localIPs)
                {
                    byte[] ipBytes = ip.GetAddressBytes();
                    byte[] maskBytes = mask.GetAddressBytes();

                    // Only scan /24 subnets to keep it quick and focused
                    if (maskBytes[0] == 255 && maskBytes[1] == 255 && maskBytes[2] == 255)
                    {
                        byte b0 = ipBytes[0];
                        byte b1 = ipBytes[1];
                        byte b2 = ipBytes[2];
                        byte localLast = ipBytes[3];

                        for (int i = 1; i <= 254; i++)
                        {
                            if (i == localLast) continue; // skip self
                            string targetIp = $"{b0}.{b1}.{b2}.{i}";
                            tasks.Add(TryConnectPort55555Async(targetIp, 300));
                        }
                    }
                }

                var results = await Task.WhenAll(tasks);
                foreach (var r in results)
                {
                    if (r.open)
                    {
                        discovered.Add(r.ip);
                        Logger.Info($"Port Scanner Discovered Poynt terminal: {r.ip}");
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Warn($"Subnet port scan failed: {ex.Message}");
            }
            return discovered;
        }

        private static async Task<(string ip, bool open)> TryConnectPort55555Async(string ip, int timeoutMs)
        {
            try
            {
                using (var client = new TcpClient())
                {
                    var connectTask = client.ConnectAsync(ip, 55555);
                    var delayTask = Task.Delay(timeoutMs);
                    var completedTask = await Task.WhenAny(connectTask, delayTask);

                    if (completedTask == connectTask && client.Connected)
                    {
                        return (ip, true);
                    }
                }
            }
            catch
            {
                // Ignore connection exceptions during silent scan
            }
            return (ip, false);
        }

        #endregion
    }
}
