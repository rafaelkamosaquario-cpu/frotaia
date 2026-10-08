import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GroupsOverview } from "./GroupsOverview";
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
const group={id:"1",name:"Pesagens João",purpose:"pesagem" as const,notes:"",archived:false,created_at:"",updated_at:""};
describe("dashboard operational groups",()=>{
  it("shows real pending registrations without claiming live intake",()=>{
    const html=renderToStaticMarkup(React.createElement(GroupsOverview,{groups:[group],error:false,allowed:true}));
    expect(html).toContain("Pesagens João");
    expect(html).toContain("Aguardando vinculação");
    expect(html).toContain("Recebimento ainda não ativado");
  });
  it("does not display group names or admin links to non-admins",()=>{
    const html=renderToStaticMarkup(React.createElement(GroupsOverview,{groups:[group],error:false,allowed:false}));
    expect(html).not.toContain("Pesagens João");
    expect(html).not.toContain('href="/frota/grupos"');
  });
  it("distinguishes errors from an empty registry and hides archived groups",()=>{
    const error=renderToStaticMarkup(React.createElement(GroupsOverview,{groups:[],error:true,allowed:true}));
    expect(error).toContain('role="alert"');
    expect(error).not.toContain("Nenhum grupo em preparação");
    const empty=renderToStaticMarkup(React.createElement(GroupsOverview,{groups:[{...group,archived:true}],error:false,allowed:true}));
    expect(empty).not.toContain("Pesagens João");
    expect(empty).toContain("Nenhum grupo em preparação");
  });
});
