DO $$ DECLARE t record; BEGIN FOR t IN SELECT "tenantId" FROM "OfficeDirectory" LOOP
 PERFORM set_config('app.tenant_id',t."tenantId"::text,true);
 UPDATE "Role" SET permissions=ARRAY['workspace:read','portal:read']::text[] WHERE key='CLIENT' AND "tenantId"=t."tenantId";
END LOOP;END $$;
ALTER TABLE "Role" ADD CONSTRAINT client_role_boundary CHECK (key<>'CLIENT' OR permissions<@ARRAY['workspace:read','portal:read']::text[]);
