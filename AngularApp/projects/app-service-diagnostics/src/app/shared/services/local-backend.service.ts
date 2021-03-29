import { HttpClient, HttpHeaders } from '@angular/common/http';
import { map, retry, catchError } from 'rxjs/operators';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { AuthService } from '../../startup/services/auth.service';
import { ArmService } from './arm.service';
import { DetectorResponse, DetectorMetaData } from 'diagnostic-data';

@Injectable()
export class LocalBackendService {
  private localEndpoint = 'http://localhost:5000';

  resourceId: string;

  detectorList: DetectorMetaData[] = [];

  useLocal: boolean = false;

  effectiveLocale: string="";

  constructor(private _http: HttpClient, private _armService: ArmService, private _authService: AuthService) {
    this._authService.getStartupInfo().subscribe(info => {
      this.resourceId = info.resourceId.replace('microsoft.web', 'Microsoft.Web');
      this.effectiveLocale = info.effectiveLocale;
    });
  }

  public getDetectorById(detectorId: string) {
    return this.detectorList.find(detector => detector.id === detectorId);
  }

  public getDetectors(overrideResourceUri:string = ""): Observable<DetectorMetaData[]> {
    let resourceId = overrideResourceUri ? overrideResourceUri : this.resourceId;
    let languageQueryParam = !this.effectiveLocale || /^\s*$/.test(this.effectiveLocale) ? `?l=${this.effectiveLocale}` : "";
    console.log("localbackend getdetectors languageparam", languageQueryParam, this.effectiveLocale);
    const path = `v4${resourceId}/detectors${this.effectiveLocale}`;
    if (this.detectorList.length > 0 && overrideResourceUri === "") {
      return of(this.detectorList);
    }

    return this.invoke<DetectorResponse[]>(path, 'POST').pipe(map(response => {
      const detectorList = response.map(detector => detector.metadata);
      if(overrideResourceUri === "") this.detectorList = detectorList;
      return detectorList;
    }));
  }

  public getDetectorsSearch(searchTerm): Observable<DetectorMetaData[]> {
    const path = `v4${this.resourceId}/detectors?text=` + encodeURIComponent(searchTerm);

    return this.invoke<DetectorResponse[]>(path, 'POST').pipe(map(response => {
      var searchResults = response.map(detector => detector.metadata).sort((a,b) => {return b.score>a.score? 1: -1;});
      return searchResults;
    }));
  }

  public getDetector(detectorName: string, startTime: string, endTime: string, refresh?: boolean, internalView?: boolean, formQueryParams?: string,overrideResourceUri?: string) {
    let resourceId = overrideResourceUri ? overrideResourceUri : this.resourceId;
    let languageQueryParam = !!this.effectiveLocale ? `&l=${this.effectiveLocale}` : "";
    let path = `v4${resourceId}/detectors/${detectorName}?startTime=${startTime}&endTime=${endTime}${languageQueryParam}`;
    console.log("localbackendservice path", path);
    if(formQueryParams != null) {
      path += formQueryParams;
    }
    return this.invoke<DetectorResponse>(path, 'POST');
  }

  public invoke<T>(path: string, method = 'GET', body: any = {}): Observable<T> {
    const url =  `${this.localEndpoint}/api/invoke`;

    const request = this._http.post<T>(url, body, {
      headers: this._getHeaders(path, method)
    }).pipe(
      retry(2)
    );

    return request;
  }

  private _getHeaders(path?: string, method?: string): HttpHeaders {
    let headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    });

    if (path) {
      headers = headers.append('x-ms-path-query', path);
    }

    if (method) {
      headers = headers.append('x-ms-method', method);
    }

    return headers;
  }

}
