-- Which provider wrote a cluster's explanation, so the fraud page can label it honestly. Null means the template.
alter table fraud_clusters add column explained_by text;
