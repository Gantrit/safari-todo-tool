-- Create a workspace and its required initial records atomically.
-- Only authenticated users with an admin profile may call this function.

CREATE OR REPLACE FUNCTION create_workspace_with_defaults(p_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_workspace_id UUID;
  v_name TEXT := btrim(p_name);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = v_user_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'An admin profile is required to create a workspace';
  END IF;

  IF v_name IS NULL OR v_name = '' OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'Workspace name must be between 1 and 120 characters';
  END IF;

  INSERT INTO public.workspaces (name, created_by)
  VALUES (v_name, v_user_id)
  RETURNING id INTO v_workspace_id;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace_id, v_user_id, 'admin');

  INSERT INTO public.boards (workspace_id, name, type)
  VALUES (v_workspace_id, 'Team Board', 'kanban');

  RETURN v_workspace_id;
END;
$$;

REVOKE ALL ON FUNCTION create_workspace_with_defaults(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_workspace_with_defaults(TEXT) TO authenticated;

-- Keep direct writes constrained as defense in depth. The setup RPC bypasses RLS
-- only after performing its own authenticated-admin check.
DROP POLICY IF EXISTS "workspaces_insert" ON public.workspaces;
CREATE POLICY "workspaces_insert" ON public.workspaces FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "workspace_members_insert" ON public.workspace_members;
CREATE POLICY "workspace_members_insert" ON public.workspace_members FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_admin(workspace_id));
