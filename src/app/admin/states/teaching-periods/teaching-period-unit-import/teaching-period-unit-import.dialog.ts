import { Component, Inject, Injectable, OnInit, ViewChild } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { FormControl, FormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatStepperModule } from '@angular/material/stepper';
import { Unit, TeachingPeriod, User, UserService, UnitService } from 'src/app/api/models/doubtfire-model';
import { Observable, filter, map, startWith } from 'rxjs';
import { MatTable, MatTableDataSource } from '@angular/material/table';
import { GlobalStateService } from 'src/app/projects/states/index/global-state.service';

export interface TeachingPeriodUnitImportData {
  teachingPeriod: TeachingPeriod;
}

interface UnitImportData {
  unitCode: string;
  sourceUnit: Unit;
  convenor: User;
  relatedUnits?: { value: Unit; text: string }[];
  done?: boolean;
}

@Injectable()
export class TeachingPeriodUnitImportService {
  constructor(public dialog: MatDialog) {}

  openImportUnitsDialog(teachingPeriod: TeachingPeriod): void {
    const dialogRef = this.dialog.open(TeachingPeriodUnitImportDialogComponent, {
      data: { teachingPeriod: teachingPeriod },
    });

    dialogRef.afterClosed().subscribe(() => {
      console.log('The dialog was closed');
    });
  }
}

/**
 * @title Dialog Overview
 * This dialog allows the user to enter a number of units to be rolled over into the a teaching period.
 */
@Component({
  selector: 'f-teaching-period-unit-import',
  templateUrl: 'teaching-period-unit-import.dialog.html',
  styleUrls: ['teaching-period-unit-import.dialog.scss'],
})
export class TeachingPeriodUnitImportDialogComponent implements OnInit {
  @ViewChild(MatTable, { static: true }) table: MatTable<UnitImportData>;

  /**
   * The list of unit related data for the import.
   */
  public unitsToImport: UnitImportData[] = [];

  public dataSource = new MatTableDataSource(this.unitsToImport);

  public teachingStaff: { value: User; text: string }[];

  public allUnits: Unit[];

  /**
   * A list of the codes to add - or an individual code
   */
  public codesToAdd: string = '';

  public displayedColumns: string[] = ['unitCode', 'sourceUnit', 'convenor', 'status', 'actions'];

  constructor(
    public dialogRef: MatDialogRef<TeachingPeriodUnitImportData>,
    private userService: UserService,
    private unitService: UnitService,
    private globalStateService: GlobalStateService,
    @Inject(MAT_DIALOG_DATA) public data: TeachingPeriodUnitImportData
  ) {}

  ngOnInit(): void {
    // Listen for units to be loaded
    this.globalStateService.onLoad(() => {
      this.globalStateService.loadedUnits.values.subscribe((units) => (this.allUnits = units));
    });

    // Load all teaching staff
    this.userService.getTutors().subscribe((staff) => {
      // Load all units now we have the staff
      this.loadAllUnits();
      this.teachingStaff = staff
        .filter((s) => ['Convenor', 'Admin'].includes(s.systemRole))
        .map((s) => {
          return { value: s, text: s.name };
        });
    });
  }

  private loadAllUnits() {
    // Load all units
    this.unitService.query(undefined, { params: { include_in_active: true } }).subscribe({
      next: (success) => {
        return;
      },
      error: (failure) => {
        //TODO: Add alert
        console.log(failure);
      },
    });
  }

  public onCloseClick(): void {
    this.dialogRef.close();
  }

  public relatedUnits(code: string): { value: Unit; text: string }[] {
    return this.allUnits
      .filter((u) => u.code.includes(code) || code.includes(u.code))
      .sort((a, b) => b.startDate.valueOf() - a.startDate.valueOf())
      .map((u) => {
        return { value: u, text: u.codeAndPeriod };
      });
  }

  public get teachigPeriod(): TeachingPeriod {
    return this.data.teachingPeriod;
  }

  public statusForUnit(value: UnitImportData): string {
    if (value.done) return 'Done!';
    if (value.done !== undefined && !value.done) return 'Error! - check log';
    if (!value.sourceUnit) return 'Create new unit';
    if (this.teachigPeriod.hasUnitLike(value.sourceUnit)) return 'Skip - Already in teaching period';
    if (this.unitsToImport.filter((u) => u.unitCode === value.sourceUnit.code).length > 1) {
      return 'Duplicate - Source unit appears twice';
    }

    return 'Awaiting Import';
  }

  /**
   * Remove a unit from the list to import.
   *
   * @param value The unit to remove from the list of units to import
   */
  public removeUnitToAdd(value: UnitImportData) {
    this.unitsToImport = this.unitsToImport.filter((u) => u.unitCode !== value.unitCode);
    // Ensure we use the new array object in the data source
    this.dataSource.data = this.unitsToImport;
    this.table.renderRows();
  }

  public addUnitsByCode() {
    const codes = this.codesToAdd.split(',').map((code) => code.trim());
    for (const code of codes) {
      if (code.length == 0) continue;
      if (this.unitsToImport.find((u) => u.unitCode === code)) continue;

      const relatedUnits = this.relatedUnits(code);
      const sourceUnit = relatedUnits.length > 0 ? relatedUnits[0].value : null;

      this.unitsToImport.push({
        unitCode: code,
        sourceUnit: sourceUnit,
        convenor: sourceUnit?.mainConvenor?.user || sourceUnit?.mainConvenorUser,
        relatedUnits: relatedUnits,
      });
    }

    this.codesToAdd = '';
    this.table.renderRows();
  }

  private importUnit(idx: number) {
    // Stop when past last unit to import
    if (idx >= this.unitsToImport.length) return;
    const unitToImport = this.unitsToImport[idx];
    unitToImport.sourceUnit.rolloverTo({ teaching_period_id: this.data.teachingPeriod.id }).subscribe({
      next: (newUnit: Unit) => {
        unitToImport.done = true;
        // Employ the convenor
        if (unitToImport.convenor && unitToImport.convenor != newUnit.mainConvenorUser) {
          newUnit.addStaff(unitToImport.convenor, 'Convenor').subscribe({
            next: (newRole) => {
              console.log(`Employed ${unitToImport.convenor.name} in ${newUnit.code}`);
              newUnit.changeMainConvenor(newRole).subscribe({
                next: () => {
                  console.log(`Set ${unitToImport.convenor.name} as main convenor in ${newUnit.code}`);
                },
                error: (failure) => {
                  console.log(failure);
                },
              });
            },
            error: (failure) => {
              console.log(failure);
            },
          });
        }
        this.importUnit(idx + 1);
      },
      error: (failure) => {
        console.log(failure);
        unitToImport.done = false;
        this.importUnit(idx + 1);
      },
    });
  }

  public doImport() {
    this.importUnit(0);
  }
}