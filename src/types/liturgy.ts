export interface LiturgyReading {
  title: string;
  text: string;
  reference: string;
}

export interface LiturgyData {
  date: string;
  liturgy: string;
  liturgicalColor: string;
  firstReading?: LiturgyReading;
  psalm?: LiturgyReading;
  secondReading?: LiturgyReading;
  gospel?: LiturgyReading;
}

