# Read endpoints and semantics

Verified against primary API documentation on 2026-11-17. The collector never accepts a custom
API endpoint, token URI, HTTP method or additional credential source from configuration.

Google:

- [Service-account JWT OAuth flow](https://developers.google.com/identity/protocols/oauth2/service-account):
  RSA SHA-256 signed JWT, fixed audience/token endpoint `https://oauth2.googleapis.com/token`,
  one-hour expiry, no user impersonation. Credential JSON's `token_uri` is intentionally ignored.
- [Search Analytics query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query):
  `POST https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query`,
  `webmasters.readonly` scope; dates are PT/inclusive, `dataState: final`, `type: web`.
  `rowLimit` permits up to 25,000, `startRow` paginates; top-row restrictions remain.
- [Sitemaps list](https://developers.google.com/webmaster-tools/v1/sitemaps/list):
  `GET .../sites/{siteUrl}/sitemaps`, successful empty response is an empty inventory.
- [Sites get](https://developers.google.com/webmaster-tools/v1/sites/get):
  `GET .../sites/{siteUrl}`, property and permission metadata. Domain properties use the
  `sc-domain:example.org` form; URL-prefix properties must be explicitly supplied as HTTPS URLs.

Bing JSON methods all use `GET https://ssl.bing.com/webmaster/api.svc/json/{method}` with
`siteUrl` and API key as query parameters. The API key appears only in the outgoing request,
never in stored provenance or printed failure details. The response wrapper is `{ "d": [...] }`.

Method | Returned fields used | Period caveat
--- | --- | ---
[GetRankAndTrafficStats](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getrankandtrafficstats?view=bing-webmaster-dotnet) | Date, Clicks, Impressions | Daily updates; multiple verticals including Chat
[GetQueryStats](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getquerystats?view=bing-webmaster-dotnet) | Date, Query, Clicks, Impressions, AvgClickPosition, AvgImpressionPosition | Weekly updates; top queries
[GetPageStats](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getpagestats?view=bing-webmaster-dotnet) | Same QueryStats schema; Query contains the page URL | Weekly updates; top pages
[GetCrawlStats](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getcrawlstats?view=bing-webmaster-dotnet) | Date, response-code counts, robots blocks, crawl errors, CrawledPages, InIndex, InLinks, malware count | Daily updates; up to last six months
[GetFeeds](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getfeeds?view=bing-webmaster-dotnet) | Url, Status, Type, LastCrawled, Submitted, UrlCount, FileSize | Top-level feed inventory

The JSON dates can be `/Date(milliseconds-offset)/`. Milliseconds identify the instant; preserve
the original offset-bearing string rather than guessing a calendar-day interval. No methods above
take `startDate` or `endDate`. The documentation's update cadence does not specify every row's
aggregation duration. The collector therefore stores rows without inventing daily or weekly totals.
The RankAndTrafficStats documentation has a mismatched XML sample method; its JSON sample and
method signature both identify `GetRankAndTrafficStats`, which this collector uses.

[Bing API overview](https://learn.microsoft.com/en-us/bingwebmaster/) announces retirement of
SOAP/POX in August 2026; this collector uses the documented JSON REST surface, not SOAP/POX.
[API-key access](https://learn.microsoft.com/en-us/bingwebmaster/getting-access) is user-scoped
and may cover all verified sites. Use a dedicated organization account; possession of a key is
not evidence that its permission boundary is site-specific or read-only. The helper enforces its
own fixed read-method boundary, refuses redirects, and has no mutation interface.
