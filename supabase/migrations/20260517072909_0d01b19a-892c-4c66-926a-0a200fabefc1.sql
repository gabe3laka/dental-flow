update storage.buckets
   set file_size_limit = 209715200,
       allowed_mime_types = array['video/mp4','video/webm','video/quicktime']
 where id = 'scan-videos';