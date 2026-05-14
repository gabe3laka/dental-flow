-- Reset reconstruct-scan-callback Step-4 verification test rows
update public.scans
   set splat_url = null,
       splat_processing_status = null,
       splat_processing_error = null,
       splat_reconstructed_at = null,
       splat_metrics = null
 where id = '3a6e4c67-c6c9-4f9d-902c-356e6370cdc3';

update public.scans
   set pointcloud_url = null,
       processing_status = null,
       processing_error = null,
       reconstructed_at = null,
       lingbot_metrics = null
 where id = '146a48d0-8954-40c8-9e18-b85fa1718df3';
