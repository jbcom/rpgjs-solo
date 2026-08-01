# Rejected Solo beta.28.solo.1 release train

Status: cancelled before versioning or publication.

Canonical RPGJS Solo commit
`645859a2302640eebaddb543067cfcf22d4163f8` passed its complete Node 24 main CI
and CodeQL gates. A coordinated `5.0.0-beta.28.solo.1` plan was then drafted
locally, but an independent release audit found that upstream RPGJS v5 had
already advanced from adopted commit
`c858081051a18bc9410cb2f78deafcc31a40f07f` to released commit
`2fab01fb8e93ad13902b07db28935f058b387213`.

Publishing the beta.28 train as `latest` would violate the repository and fleet
rule that a private package cannot be feature-complete against a knowingly
stale underlying release. No package was versioned, tagged, or published. The
draft release branch is retained only as local rejected evidence until branch
reconciliation; none of its contracts or tests grant release authority.

The recovery sequence is:

1. fast-forward public GitHub `v5` exactly to upstream `2fab01fb`;
2. audit `c8580810..2fab01fb` by behavior, tests, manifests, and bundles;
3. merge the audited inherited source into a focused beta.29 product branch;
4. preserve the Solo production exclusions and the fork's current Node 24
   toolchain while regenerating the lockfile;
5. independently review and merge the beta.29 adoption;
6. prove the resulting canonical main against a real starter and silent Solo
   browser consumer; and
7. author a new coordinated beta.29 Solo release contract only from that green
   exact-main boundary.

The GitHub `v5` fast-forward is complete and exactly equals `2fab01fb`; the
remaining steps are not claimed complete by this record.
