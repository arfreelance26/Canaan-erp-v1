export type MaintenanceCategoryRepair = {
  id: string;
  categoryId: string;
  name: string;
  version?: number;
};

export type MaintenanceCategory = {
  id: string;
  name: string;
  version?: number;
  repairs: MaintenanceCategoryRepair[];
};
