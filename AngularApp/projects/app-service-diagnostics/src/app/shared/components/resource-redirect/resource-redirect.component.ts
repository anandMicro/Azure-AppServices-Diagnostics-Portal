import { Component, OnInit } from '@angular/core';
import { AuthService } from '../../../startup/services/auth.service';
import { Router, NavigationExtras } from '@angular/router';
import { WindowService } from '../../../startup/services/window.service';
import { environment } from '../../../../environments/environment';
import { StartupInfo } from '../../models/portal';
import { DemoSubscriptions } from '../../../betaSubscriptions';
import { DetectorType, TelemetryService } from 'diagnostic-data';
import { VersionTestService } from '../../../fabric-ui/version-test.service';
import { PortalService } from '../../../startup/services/portal.service';

@Component({
  selector: 'resource-redirect',
  templateUrl: './resource-redirect.component.html',
  styleUrls: ['./resource-redirect.component.scss']
})
export class ResourceRedirectComponent implements OnInit {
  private _newVersionEnabled = true;
  private _useLegacyVersion = true;
  constructor(private _authService: AuthService, private _router: Router, private _windowService: WindowService, private _versionTestService: VersionTestService, private _telemetryService: TelemetryService, private _portalService: PortalService) { }

  ngOnInit() {
    this._versionTestService.isLegacySub.subscribe(useLegacyVersion => this._useLegacyVersion = useLegacyVersion);
    this.navigateToExperience();
  }

  navigateToExperience() {
    this._authService.getStartupInfo()
      .subscribe(info => {
        if (info) {
            const resourceId = info.resourceId ? info.resourceId : '';
            const ticketBladeWorkflowId = info.workflowId ? info.workflowId : '';
            const supportTopicId = info.supportTopicId ? info.supportTopicId : '';
            const sessionId = info.sessionId ? info.sessionId : '';
            const effectiveLocale = info.effectiveLocale ? info.effectiveLocale: '';

            const eventProperties: { [name: string]: string } = {
                'ResourceId': resourceId,
                'TicketBladeWorkflowId': ticketBladeWorkflowId,
                'SupportTopicId': supportTopicId,
                'PortalSessionId': sessionId,
                'EffectiveLocale': effectiveLocale,
            };
            this._telemetryService.eventPropertiesSubject.next(eventProperties);
        }

        if (info && info.resourceId && info.token) {
          if (info.optionalParameters && info.optionalParameters.find(param => param.key === "categoryId")) {
            //  Open the new experience since we are navigating to a specific category
            this._versionTestService.setLegacyFlag(2);
          }
          //   Uncomment to enable only for internal subs
          let split = info.resourceId.split('/');
          let subscriptionId = split[split.indexOf('subscriptions') + 1];
          this._newVersionEnabled = DemoSubscriptions.betaSubscriptions.indexOf(subscriptionId) >= 0;
          const navigationExtras: NavigationExtras = {
            queryParamsHandling: 'merge',
          };

          let path = 'resource' + info.resourceId.toLowerCase();
          var caseSubject = null;
          if (info.optionalParameters) {
            var caseSubjectParam = info.optionalParameters.find(param => param.key === "caseSubject");
            if (caseSubjectParam) {
              caseSubject = caseSubjectParam.value;
            }

            var referrerParam = info.optionalParameters.find(param => param.key.toLowerCase() === "referrer");
            if (referrerParam) {
              path += `/portalReferrerResolver`;
              this._router.navigateByUrl(
                this._router.createUrlTree([path])
              );
            }
          }
          if (info.supportTopicId) {
            path += `/supportTopicId`;
            navigationExtras.queryParams = {
              supportTopicId: info.supportTopicId,
              caseSubject: caseSubject,
              pesId: info.pesId
            };
          }

          if(info.effectiveLocale)
          {
            navigationExtras.queryParams = navigationExtras.queryParams ? {...navigationExtras.queryParams, ...{"l": info.effectiveLocale}}: {"l": info.effectiveLocale};
          }

          console.log("navigation", path, navigationExtras);
          this._router.navigateByUrl(
            this._router.createUrlTree([path], navigationExtras)
          );

          if (!this._useLegacyVersion) {
            // This additional info is used to open a specific detector/tool under the right category in a new SCIFrameblade
            // To Open the detector or diagnostic tool under the right category
            if (info.optionalParameters) {
              let categoryIdParam = info.optionalParameters.find(param => param.key === "categoryId");
              if (categoryIdParam) {
                let categoryId = categoryIdParam.value;
                path += `/categories/${categoryId}`;

                // To Open the overview page under the right category
                let detectorTypeParam = info.optionalParameters.find(param => param.key === "detectorType");
                let detectorIdParam = info.optionalParameters.find(param => param.key === "detectorId");
                let toolIdParam = info.optionalParameters.find(param => param.key === "toolId");

                if (detectorIdParam && detectorTypeParam) {
                  if (detectorTypeParam.value === DetectorType.Detector) {
                    path += `/detectors/${detectorIdParam.value}`;
                  } else if (detectorTypeParam.value === DetectorType.Analysis) {
                    path += `/analysis/${detectorIdParam.value}`;
                  }
                } else if (toolIdParam) {
                  path += `/tools/${toolIdParam.value}`;
                }

                this._router.navigateByUrl(
                  this._router.createUrlTree([path], navigationExtras)
                );
              }
            }
          }

        } else {
          if (!environment.production) {
            this._router.navigateByUrl('/test');
          }
        }
      });
  }

  updateRouteBasedOnAdditionalParameters(route: string, additionalParameters: any): string {
    if (additionalParameters.featurePath) {
      let featurePath: string = additionalParameters.featurePath;
      featurePath = featurePath.startsWith('/') ? featurePath.replace('/', '') : featurePath;

      return `${route}/${featurePath}`;
    }
  }

  getRouteBasedOnSupportTopicId(info: StartupInfo): string {

    let path: string;

    // If no support topic id, then default to diagnostics home page
    if (!info.supportTopicId || info.supportTopicId === '') {
      path = '/diagnostics';
    } else {
      path = `/supportTopic/${info.supportTopicId}`;
    }

    return path;

  }

}
