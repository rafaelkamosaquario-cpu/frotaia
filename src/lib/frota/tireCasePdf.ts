import type {TireCaseRow} from "./tireCases";
import {caseSheetData,tireSheetPdf} from "./tireSheetPdf";
export async function tireCasePdf(row:TireCaseRow){return tireSheetPdf(caseSheetData(row));}
