import { ResponseMessageEnvelope } from '../../../models/responsemessageenvelope';
import { Site, SiteInfoMetaData } from '../../../models/site';
import { ArmService } from '../../../services/arm.service';

enum ConnectionCheckStatus { success, timeout, hostNotFound, blocked, refused }

export class DiagProvider {
    private _siteInfo: SiteInfoMetaData & Site & { fullSiteName: string };
    private _armService: ArmService;
    constructor(siteInfo: SiteInfoMetaData & Site & { fullSiteName: string }, armService: ArmService) {
        this._siteInfo = siteInfo;
        this._armService = armService;
    }

    public getArmResourceAsync<T>(resourceUri: string, apiVersion?: string, invalidateCache: boolean = false): Promise<T> {
        var stack = new Error("replace_placeholder").stack;
        return this._armService.getArmResource<T>(resourceUri, apiVersion, invalidateCache)
            .toPromise()
            .catch(e => {
                var err = new Error(e);
                err.stack = stack.replace("replace_placeholder", e);
                throw err;
            });
    }

    public postResourceAsync<T, S>(resourceUri: string, body?: S, apiVersion?: string, invalidateCache: boolean = false, appendBodyToCacheKey: boolean = false): Promise<boolean | {} | ResponseMessageEnvelope<T>> {
        return this.postArmResourceAsync(resourceUri, body, apiVersion, invalidateCache, appendBodyToCacheKey);
    }

    public postArmResourceAsync<T, S>(resourceUri: string, body?: S, apiVersion?: string, invalidateCache: boolean = false, appendBodyToCacheKey: boolean = false): Promise<boolean | {} | ResponseMessageEnvelope<T>> {
        var stack = new Error("replace_placeholder").stack;
        return this._armService.postResource<T, S>(resourceUri, body, apiVersion, invalidateCache, appendBodyToCacheKey)
            .toPromise()
            .catch(e => {
                var err = new Error(e);
                err.stack = stack.replace("replace_placeholder", e);
                throw err;
            });
    }

    public getKudoApiAsync<T>(siteName: string, uri: string): Promise<T> {
        var stack = new Error("replace_placeholder").stack;
        return this._armService.get<T>(`https://${siteName}.scm.azurewebsites.net/api/${uri}`)
            .toPromise()
            .catch(e => {
                var err = new Error(e);
                err.stack = stack.replace("replace_placeholder", e);
                throw err;
            });
    }

    public postKudoApiAsync<T, S>(siteName: string, uri: string, body?: S, instance?: string): Promise<boolean | {} | ResponseMessageEnvelope<T>> {
        var postfix = (instance == null ? "" : `?instance=${instance}`);
        var stack = new Error("replace_placeholder").stack;
        return this._armService.post<T, S>(`https://${siteName}.scm.azurewebsites.net/api/${uri}${postfix}`, body)
            .toPromise()
            .catch(e => {
                var err = new Error(e);
                err.stack = stack.replace("replace_placeholder", e);
                throw err;
            });
    }

    public async runKudoCommand(siteName: string, command: string, dir?: string, instance?: string): Promise<any> {
        var result: any = await this.postKudoApiAsync(siteName, "command", { "command": command, "dir": dir }, instance);
        return result.Output.slice(0, -2);
    }

    public getEnvironmentVariablesAsync(names: string[], instance?: string) {
        var stack = new Error("replace_placeholder").stack;
        var promise = (async () => {
            names = names.map(n => `%${n}%`);
            var echoPromise = this.runKudoCommand(this._siteInfo.fullSiteName, `echo ${names.join(";")}`, undefined, instance).catch(e => {
                console.log("getEnvironmentVariables failed", e);
                e.message = "getEnvironmentVariablesAsync failed:" + e.message;
                throw e;
            });
            var result = await echoPromise;
            result = result.split(";").map((r, i) => r == names[i] ? null : r);
            return result;
        })();

        return promise.catch(e => {
            var err = new Error(e);
            err.stack = stack.replace("replace_placeholder", e.message || e);
            throw err;
        });
    }

    public async tcpPingAsync(hostname: string, port: number, count: number = 1, instance?: string): Promise<{ status: ConnectionCheckStatus, statuses: ConnectionCheckStatus[] }> {
        var stack = new Error("replace_placeholder").stack;
        var promise = (async () => {
            var pingPromise = this.runKudoCommand(this._siteInfo.fullSiteName, `tcpping -n ${count} ${hostname}:${port}`, undefined, instance).catch(e => {
                console.log("tcpping failed", e);
                return null;
            });
            var pingResult = await pingPromise;

            var statuses: ConnectionCheckStatus[] = [];
            if (pingResult != null) {
                var splited = pingResult.split("\r\n");
                for (var i in splited) {
                    var line = splited[i];
                    if (line.startsWith("Connected to ")) {
                        statuses.push(ConnectionCheckStatus.success);
                    } else if (line.includes("No such host is known")) {
                        statuses.push(ConnectionCheckStatus.hostNotFound);
                    } else if (line.includes("Connection timed out")) {
                        statuses.push(ConnectionCheckStatus.timeout);
                    } else if (line.startsWith("Connection attempt failed: An attempt was made to access a socket")) {
                        statuses.push(ConnectionCheckStatus.blocked);
                    } else if (line.startsWith("Complete")) {
                        break;
                    } else {
                        throw new Error(`checkConnectionAsync: unknown status ${pingResult}`);
                    }
                }
            }
            var status: ConnectionCheckStatus = statuses.some(s => s == ConnectionCheckStatus.success) ? ConnectionCheckStatus.success : statuses[0];
            return { status, statuses };
        })();

        return promise.catch(e => {
            var err = new Error(e);
            err.stack = stack.replace("replace_placeholder", e.message || e);
            throw err;
        });
    }

    //TODO need to read DNS setting of VNet
    public async checkConnectionAsync(hostname: string, port: number, count: number = 1, dns: string = "", instance?: string): Promise<{ status: ConnectionCheckStatus, ip: string, aliases: string, statuses: ConnectionCheckStatus[] }> {
        var stack = new Error("replace_placeholder").stack;
        var promise = (async () => {
            var nameResolverPromise = this.runKudoCommand(this._siteInfo.fullSiteName, `nameresolver ${hostname} ${dns}`, undefined, instance).catch(e => {
                console.log("nameresolver failed", e);
                return null;
            });
            var pingPromise = this.tcpPingAsync(hostname, port, count, instance);
            await Promise.all([nameResolverPromise.catch(e => e), pingPromise.catch(e => e)]);
            var nameResovlerResult = await (nameResolverPromise.catch(e => null));
            var pingResult = await (pingPromise.catch(e => null));
            console.log(nameResovlerResult, pingResult);
            var ip: string = null, aliases: string = null;
            if (nameResovlerResult != null) {
                if(nameResovlerResult.includes("Aliases")){
                    var match = nameResovlerResult.match(/Addresses:\s*([\S\s]*)Aliases:\s*([\S\s]*)$/);
                    if (match != null) {
                        ip = match[1].split("\r\n").filter(i => i.length > 0).join(";");
                        aliases = match[2].split("\r\n").filter(i => i.length > 0).join(";");
                    }
                }else{
                    var match = nameResovlerResult.match(/Addresses:\s*([\S\s]*)$/);
                    if (match != null) {
                        ip = match[1].split("\r\n").filter(i => i.length > 0).join(";");
                    }
                }
            }

            return { status: pingResult && pingResult.status, ip, aliases, statuses: pingResult && pingResult.statuses };
        })();

        return promise.catch(e => {
            var err = new Error(e);
            err.stack = stack.replace("replace_placeholder", e.message || e);
            throw err;
        });
    }

    public async GetWebAppVnetInfo() {
        //This is the regional VNet Integration endpoint
        var swiftUrl = this._siteInfo["id"] + "/config/virtualNetwork";
        var siteVnetInfo = await this.getArmResourceAsync(swiftUrl);
        return siteVnetInfo;
    }
}